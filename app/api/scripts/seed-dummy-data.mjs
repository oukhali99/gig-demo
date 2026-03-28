#!/usr/bin/env node
/**
 * Inserts deterministic demo rows into gig-demo DynamoDB tables.
 *
 * Default ~200 items total (split: 60% jobs, 25% bookings, 15% payments).
 * Override with SEED_TOTAL_ITEMS (clamped 10–2000).
 *
 * Terraform wrapper (runs tf init then seed): yarn seed:dummy:dev | seed:dummy:prod
 *
 * Manual: set JOBS_TABLE_NAME, BOOKINGS_TABLE_NAME, PAYMENTS_TABLE_NAME (+ optional notif/reviews).
 * SEED_CLIENT_SUB / SEED_WORKER_SUB for Cognito alignment.
 */

import { createHash } from 'node:crypto';
import { DynamoDBClient, BatchWriteItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';

const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
const ddb = new DynamoDBClient({ region });

const CLIENT_SUB = process.env.SEED_CLIENT_SUB || 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const WORKER_SUB = process.env.SEED_WORKER_SUB || 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const CATEGORIES = ['landscaping', 'handyman', 'moving', 'other'];
const CITIES = ['Austin, TX', 'Dallas, TX', 'Houston, TX', 'Denver, CO', 'Phoenix, AZ'];
const BOOKING_STATUSES = ['requested', 'confirmed', 'in_progress', 'completed', 'cancelled'];

function deterministicUuid(prefix, i) {
  const h = createHash('sha256').update(`${prefix}:${i}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function isoDaysAgo(i) {
  const d = new Date('2025-01-15T12:00:00.000Z');
  d.setUTCDate(d.getUTCDate() - Math.floor(i / 3));
  d.setUTCHours(12 + (i % 12), (i * 7) % 60, 0, 0);
  return d.toISOString();
}

function req(name) {
  const v = process.env[name];
  if (!v?.trim()) {
    console.error(`Missing required env: ${name}`);
    process.exit(1);
  }
  return v.trim();
}

async function batchPut(tableName, items) {
  const CHUNK = 25;
  for (let i = 0; i < items.length; i += CHUNK) {
    const chunk = items.slice(i, i + CHUNK);
    const res = await ddb.send(
      new BatchWriteItemCommand({
        RequestItems: {
          [tableName]: chunk.map((item) => ({
            PutRequest: { Item: marshall(item, { removeUndefinedValues: true }) },
          })),
        },
      })
    );
    const unprocessed = res.UnprocessedItems?.[tableName];
    if (unprocessed?.length) {
      await ddb.send(
        new BatchWriteItemCommand({
          RequestItems: { [tableName]: unprocessed },
        })
      );
    }
  }
}

async function main() {
  const total = Math.min(2000, Math.max(10, parseInt(process.env.SEED_TOTAL_ITEMS || '200', 10) || 200));
  const jobsN = Math.floor(total * 0.6);
  const bookingsN = Math.floor(total * 0.25);
  const paymentsN = total - jobsN - bookingsN;

  const jobsTable = req('JOBS_TABLE_NAME');
  const bookingsTable = req('BOOKINGS_TABLE_NAME');
  const paymentsTable = req('PAYMENTS_TABLE_NAME');
  const notificationsTable = process.env.NOTIFICATIONS_TABLE_NAME?.trim();
  const reviewsTable = process.env.REVIEWS_TABLE_NAME?.trim();

  console.log(`Seeding DynamoDB in ${region} (target ${total} items: ${jobsN} jobs, ${bookingsN} bookings, ${paymentsN} payments)…`);
  console.log(`Client sub: ${CLIENT_SUB}`);
  console.log(`Worker sub: ${WORKER_SUB}`);

  const jobs = [];
  for (let i = 0; i < jobsN; i++) {
    const jobId = deterministicUuid('job', i);
    const publishedFirst = i < bookingsN;
    let status;
    if (publishedFirst) {
      status = 'published';
    } else {
      const r = (i + bookingsN) % 5;
      status = r === 0 ? 'draft' : r === 1 ? 'closed' : 'published';
    }
    const t = isoDaysAgo(i);
    jobs.push({
      jobId,
      clientId: CLIENT_SUB,
      title: `Seed job #${i + 1} — ${CATEGORIES[i % CATEGORIES.length]} help`,
      categoryId: CATEGORIES[i % CATEGORIES.length],
      location: CITIES[i % CITIES.length],
      description: `Bulk seed item ${i + 1}/${jobsN}. Deterministic demo data.`,
      budget: String(50 + (i % 450)),
      scheduledAt: t,
      status,
      createdAt: t,
      updatedAt: t,
    });
  }

  const publishedJobs = jobs.filter((j) => j.status === 'published');
  const bookingSlots = Math.min(bookingsN, publishedJobs.length);
  const bookings = [];
  for (let b = 0; b < bookingSlots; b++) {
    const job = publishedJobs[b];
    const bookingId = deterministicUuid('booking', b);
    const status = BOOKING_STATUSES[b % BOOKING_STATUSES.length];
    const t0 = isoDaysAgo(jobsN + b);
    const t1 = isoDaysAgo(jobsN + b + 1);
    bookings.push({
      bookingId,
      jobId: job.jobId,
      workerId: WORKER_SUB,
      clientId: CLIENT_SUB,
      status,
      createdAt: t0,
      updatedAt: t1,
      idempotencyKey: `seed-idem-${bookingId}`,
    });
  }

  const paymentEligible = bookings.filter((bk) =>
    ['confirmed', 'in_progress', 'completed'].includes(bk.status)
  );
  const payments = [];
  for (let p = 0; p < paymentsN && p < paymentEligible.length; p++) {
    const bk = paymentEligible[p];
    const paymentId = deterministicUuid('payment', p);
    const released = bk.status === 'completed';
    const t0 = bk.createdAt;
    const t1 = bk.updatedAt;
    payments.push({
      paymentId,
      bookingId: bk.bookingId,
      amount: `${(p % 200) + 25}.00`,
      currency: 'USD',
      status: released ? 'released' : 'hold_created',
      createdAt: t0,
      updatedAt: t1,
      clientId: CLIENT_SUB,
      workerId: WORKER_SUB,
      idempotencyKey: `seed-pay-${paymentId}`,
    });
  }

  await batchPut(jobsTable, jobs);
  console.log(`Wrote ${jobs.length} jobs → ${jobsTable}`);

  if (bookings.length) {
    await batchPut(bookingsTable, bookings);
    console.log(`Wrote ${bookings.length} bookings → ${bookingsTable}`);
  }

  if (payments.length) {
    await batchPut(paymentsTable, payments);
    console.log(`Wrote ${payments.length} payments → ${paymentsTable}`);
  }

  const smallExtras = total <= 40 && notificationsTable;
  if (smallExtras) {
    const notifItems = [
      {
        userId: CLIENT_SUB,
        eventId: deterministicUuid('notif', 0),
        eventType: 'booking.created',
        title: 'Seed notification',
        body: 'Demo inbox row for the client user',
        read: false,
        createdAt: isoDaysAgo(1),
      },
      {
        userId: WORKER_SUB,
        eventId: deterministicUuid('notif', 1),
        eventType: 'booking.confirmed',
        title: 'Seed notification',
        body: 'Demo inbox row for the worker user',
        read: false,
        createdAt: isoDaysAgo(2),
      },
    ];
    await batchPut(notificationsTable, notifItems);
    console.log(`Wrote ${notifItems.length} notifications → ${notificationsTable}`);
  } else if (notificationsTable) {
    console.log('Skipped sample notifications (SEED_TOTAL_ITEMS > 40); use smaller total if you want them.');
  } else {
    console.log('Skipped notifications (NOTIFICATIONS_TABLE_NAME unset)');
  }

  if (smallExtras && reviewsTable && bookings.some((b) => b.status === 'completed')) {
    const completed = bookings.find((b) => b.status === 'completed');
    if (completed) {
      await batchPut(reviewsTable, [
        {
          bookingId: completed.bookingId,
          reviewerId: WORKER_SUB,
          revieweeId: CLIENT_SUB,
          reviewId: deterministicUuid('review', 0),
          rating: 5,
          text: 'Seed review: great client, clear instructions.',
          createdAt: completed.updatedAt,
        },
      ]);
      console.log(`Wrote 1 review → ${reviewsTable}`);
    }
  } else if (reviewsTable && !smallExtras) {
    console.log('Skipped sample review (SEED_TOTAL_ITEMS > 40).');
  } else if (!reviewsTable) {
    console.log('Skipped reviews (REVIEWS_TABLE_NAME unset)');
  }

  console.log('\nDone. Log in with SEED_CLIENT_SUB / SEED_WORKER_SUB to see list data.');
  console.log('Tip: SEED_TOTAL_ITEMS=500 for a larger dataset.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
