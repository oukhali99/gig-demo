import { describe, expect, it } from 'vitest';
import {
  cancelBooking,
  completeBooking,
  confirmBooking,
  createBooking,
  getBooking,
  listBookings,
} from './api';
import { fetchMock, lastInit, lastUrl, mockResponse, setupApiTest } from './api-test-utils';

setupApiTest();

describe('bookings', () => {
  it('createBooking sends the Idempotency-Key header and jobId body', async () => {
    fetchMock.mockResolvedValue(mockResponse({ bookingId: 'b1' }));
    await createBooking('job-1', 'idem-1');
    expect(lastUrl()).toBe('/bookings');
    const init = lastInit();
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe('idem-1');
    expect(init.body).toBe(JSON.stringify({ jobId: 'job-1' }));
  });

  it('listBookings serializes all provided filters', async () => {
    fetchMock.mockResolvedValue(mockResponse({ items: [] }));
    await listBookings({ jobId: 'j1', workerId: 'w1', status: 'confirmed', limit: 5 });
    expect(lastUrl()).toBe('/bookings?jobId=j1&workerId=w1&status=confirmed&limit=5');
  });

  it('listBookings with an empty filter object hits the bare path', async () => {
    fetchMock.mockResolvedValue(mockResponse({ items: [] }));
    await listBookings({});
    expect(lastUrl()).toBe('/bookings');
  });

  it('getBooking fetches a single booking by id', async () => {
    fetchMock.mockResolvedValue(mockResponse({ bookingId: 'b1' }));
    await getBooking('b1');
    expect(lastUrl()).toBe('/bookings/b1');
  });

  it('confirmBooking sends the paymentMethodId body when provided', async () => {
    fetchMock.mockResolvedValue(mockResponse({ bookingId: 'b1', status: 'confirmed' }));
    await confirmBooking('b1', 'pm_123');
    expect(lastUrl()).toBe('/bookings/b1/confirm');
    expect(lastInit().body).toBe(JSON.stringify({ paymentMethodId: 'pm_123' }));
  });

  it('confirmBooking omits the body when no paymentMethodId is given', async () => {
    fetchMock.mockResolvedValue(mockResponse({ bookingId: 'b1', status: 'confirmed' }));
    await confirmBooking('b1');
    expect(lastInit().body).toBeUndefined();
  });

  it('completeBooking POSTs to the complete path', async () => {
    fetchMock.mockResolvedValue(mockResponse({ bookingId: 'b1', status: 'completed' }));
    await completeBooking('b1');
    expect(lastUrl()).toBe('/bookings/b1/complete');
    expect(lastInit().method).toBe('POST');
  });

  it('cancelBooking POSTs to the cancel path', async () => {
    fetchMock.mockResolvedValue(mockResponse({ bookingId: 'b1', status: 'cancelled' }));
    await cancelBooking('b1');
    expect(lastUrl()).toBe('/bookings/b1/cancel');
    expect(lastInit().method).toBe('POST');
  });
});
