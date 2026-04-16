const BASE = (import.meta.env.VITE_API_URL as string)?.replace(/\/$/, '') ?? '';

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = BASE ? `${BASE}${path}` : path;
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(options?.headers as Record<string, string>) };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string; code?: string };
    throw new ApiError(err.message ?? res.statusText, err.code ?? 'UNKNOWN', res.status);
  }
  return res.json() as Promise<T>;
}

// --- Auth ---
export interface AuthUser {
  sub: string;
  email?: string;
  /** From Cognito `custom:role` when set (e.g. `admin`). */
  role?: string;
}

export async function authRegister(email: string, password: string): Promise<{ sub: string }> {
  return request<{ sub: string }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function authLogin(email: string, password: string): Promise<{
  idToken: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  return request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
}

export async function authRefresh(refreshToken: string): Promise<{
  idToken: string;
  accessToken: string;
  expiresIn: number;
}> {
  return request('/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken }) });
}

export async function authMe(): Promise<AuthUser> {
  return request<AuthUser>('/auth/me');
}

export async function authConfirm(email: string, code: string): Promise<void> {
  await request('/auth/confirm', { method: 'POST', body: JSON.stringify({ email, code }) });
}

export async function authResendConfirmation(email: string): Promise<void> {
  await request('/auth/resend-confirmation', { method: 'POST', body: JSON.stringify({ email }) });
}

// --- Admin (JWT + Cognito custom:role=admin) ---
export interface AdminModerationPendingResponse {
  items: { key: string; lastModified?: string }[];
  nextCursor?: string;
  prefix: string;
}

export async function getAdminModerationPending(params?: {
  prefix?: 'jobs' | 'bookings';
  cursor?: string;
}): Promise<AdminModerationPendingResponse> {
  const sp = new URLSearchParams();
  if (params?.prefix) sp.set('prefix', params.prefix);
  if (params?.cursor) sp.set('cursor', params.cursor);
  const q = sp.toString();
  return request<AdminModerationPendingResponse>(`/admin/moderation/pending${q ? `?${q}` : ''}`);
}

export async function adminModerationApprove(key: string): Promise<{ key: string; moderation: string }> {
  return request('/admin/moderation/approve', { method: 'POST', body: JSON.stringify({ key }) });
}

export async function adminModerationReject(key: string): Promise<{ key: string; removed: boolean }> {
  return request('/admin/moderation/reject', { method: 'POST', body: JSON.stringify({ key }) });
}

/** Presigned S3 GET for one pending_review object (admin JWT). */
export async function getAdminModerationPreviewUrl(key: string): Promise<{ url: string; expiresIn: number }> {
  const sp = new URLSearchParams({ key });
  return request<{ url: string; expiresIn: number }>(`/admin/moderation/preview-url?${sp.toString()}`);
}

/** Get user by sub (identity/Cognito). Returns { sub, email, name, bio }. Requires JWT. */
export interface UserProfile {
  sub: string;
  email: string;
  name?: string | null;
  bio?: string | null;
}

export async function stripeOnboard(): Promise<{ url: string }> {
  return request<{ url: string }>('/users/me/stripe/onboard', { method: 'POST' });
}

export async function stripeStatus(): Promise<{ configured: boolean; detailsSubmitted: boolean }> {
  return request<{ configured: boolean; detailsSubmitted: boolean }>('/users/me/stripe/status');
}

export async function getUser(sub: string): Promise<UserProfile> {
  return request<UserProfile>(`/users/${encodeURIComponent(sub)}`);
}

export async function updateUser(sub: string, body: { name?: string; bio?: string }): Promise<UserProfile> {
  return request<UserProfile>(`/users/${encodeURIComponent(sub)}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

// --- Jobs ---
export interface Job {
  jobId: string;
  clientId: string;
  title: string;
  categoryId: string;
  location: string;
  description: string;
  budget: number;
  scheduledAt: string;
  status: 'draft' | 'published' | 'closed';
  createdAt: string;
  updatedAt: string;
  imageKeys?: string[];
}

export interface ListJobsResponse {
  items: Job[];
  nextCursor?: string;
}

export async function listJobs(params?: { status?: string; clientId?: string; limit?: number; cursor?: string }): Promise<ListJobsResponse> {
  const sp = new URLSearchParams();
  if (params?.status) sp.set('status', params.status);
  if (params?.clientId) sp.set('clientId', params.clientId);
  if (params?.limit) sp.set('limit', String(params.limit));
  if (params?.cursor) sp.set('cursor', params.cursor);
  const q = sp.toString();
  return request<ListJobsResponse>(`/jobs${q ? `?${q}` : ''}`);
}

/** List current user's draft jobs. */
export async function listMyDrafts(params?: { limit?: number; cursor?: string }): Promise<ListJobsResponse> {
  return listJobs({ clientId: 'me', status: 'draft', limit: params?.limit ?? 50, cursor: params?.cursor });
}

export async function getJob(id: string): Promise<Job> {
  return request<Job>(`/jobs/${id}`);
}

export interface CreateJobBody {
  title: string;
  categoryId: string;
  location: string;
  description: string;
  budget: number;
  scheduledAt: string;
}

export async function createJob(body: CreateJobBody): Promise<Job> {
  return request<Job>('/jobs', { method: 'POST', body: JSON.stringify(body) });
}

export type AssistantPurpose = 'job_draft' | 'profile_bio';

export interface AssistantChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantChatResponse {
  message: { role: 'assistant'; content: string };
}

async function assistantChatErrorMessage(res: Response): Promise<string> {
  const err = (await res.json().catch(() => ({}))) as {
    message?: string;
    errors?: { message?: string }[];
  };
  if (typeof err.message === 'string' && err.message) return err.message;
  const first = err.errors?.[0]?.message;
  if (typeof first === 'string' && first) return first;
  return res.statusText || 'Request failed';
}

/** JWT required. `purpose` selects server system prompt; `context` is optional UI snapshot (not stored server-side). */
export async function postAssistantChat(body: {
  purpose: AssistantPurpose;
  messages: AssistantChatMessage[];
  context?: Record<string, unknown>;
}): Promise<AssistantChatResponse> {
  const url = BASE ? `${BASE}/assistant/chat` : '/assistant/chat';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      purpose: body.purpose,
      messages: body.messages,
      ...(body.context !== undefined ? { context: body.context } : {}),
    }),
  });
  if (!res.ok) {
    throw new Error(await assistantChatErrorMessage(res));
  }
  return res.json() as Promise<AssistantChatResponse>;
}

export async function publishJob(id: string): Promise<Job> {
  return request<Job>(`/jobs/${id}/publish`, { method: 'POST' });
}

// --- Job images (presigned upload + AI moderation) ---
export async function getJobImageUploadUrl(
  jobId: string,
  contentType?: string
): Promise<{ uploadUrl: string; imageKey: string; expiresIn: number; job: Job }> {
  return request<{ uploadUrl: string; imageKey: string; expiresIn: number; job: Job }>(
    `/jobs/${jobId}/images/upload-url`,
    { method: 'POST', body: JSON.stringify({ contentType: contentType ?? 'image/jpeg' }) }
  );
}

/** Upload file to presigned URL (no auth; PUT with file body). */
export async function uploadToPresignedUrl(uploadUrl: string, file: File): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type || 'image/jpeg' },
  });
  if (!res.ok) throw new Error(res.statusText || 'Upload failed');
}

export async function getJobImageUrls(jobId: string, keys: string[]): Promise<Record<string, string | null>> {
  if (keys.length === 0) return {};
  const q = new URLSearchParams({ keys: keys.join(',') });
  const res = await request<{ urls: Record<string, string | null> }>(`/jobs/${jobId}/images/urls?${q}`);
  return res.urls ?? {};
}

export async function deleteJob(id: string): Promise<void> {
  const url = BASE ? `${BASE}/jobs/${id}` : `/jobs/${id}`;
  const headers: Record<string, string> = {};
  if (getAuthToken()) headers['Authorization'] = `Bearer ${getAuthToken()}`;
  const res = await fetch(url, { method: 'DELETE', headers });
  if (res.status === 204) return;
  const err = await res.json().catch(() => ({}));
  throw new Error((err as { message?: string }).message ?? res.statusText);
}

// --- Bookings ---
export type BookingStatus =
  | 'requested'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export interface Booking {
  bookingId: string;
  jobId: string;
  workerId: string;
  clientId: string;
  status: BookingStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ListBookingsResponse {
  items: Booking[];
  nextCursor?: string;
}

export async function createBooking(jobId: string, idempotencyKey: string): Promise<Booking> {
  return request<Booking>('/bookings', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ jobId }),
  });
}

export async function listBookings(params: {
  jobId?: string;
  workerId?: string;
  status?: BookingStatus;
  limit?: number;
  cursor?: string;
}): Promise<ListBookingsResponse> {
  const sp = new URLSearchParams();
  if (params.jobId) sp.set('jobId', params.jobId);
  if (params.workerId) sp.set('workerId', params.workerId);
  if (params.status) sp.set('status', params.status);
  if (params.limit) sp.set('limit', String(params.limit));
  if (params.cursor) sp.set('cursor', params.cursor);
  const q = sp.toString();
  return request<ListBookingsResponse>(`/bookings${q ? `?${q}` : ''}`);
}

export async function getBooking(id: string): Promise<Booking> {
  return request<Booking>(`/bookings/${id}`);
}

export async function confirmBooking(id: string, paymentMethodId?: string): Promise<Booking> {
  return request<Booking>(`/bookings/${id}/confirm`, {
    method: 'POST',
    body: paymentMethodId ? JSON.stringify({ paymentMethodId }) : undefined,
  });
}

export async function completeBooking(id: string): Promise<Booking> {
  return request<Booking>(`/bookings/${id}/complete`, { method: 'POST' });
}

export async function cancelBooking(id: string): Promise<Booking> {
  return request<Booking>(`/bookings/${id}/cancel`, { method: 'POST' });
}

// --- Payments ---
export type PaymentStatus = 'hold_created' | 'released' | 'transferred' | 'transfer_failed' | 'refunded';

export interface Payment {
  paymentId: string;
  bookingId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  createdAt: string;
  updatedAt: string;
  clientId?: string;
  workerId?: string;
  stripePaymentIntentId?: string;
  transferId?: string;
}

export interface ListPaymentsResponse {
  items: Payment[];
}

export async function listPayments(params?: { limit?: number }): Promise<ListPaymentsResponse> {
  const sp = new URLSearchParams();
  if (params?.limit != null) sp.set('limit', String(params.limit));
  const q = sp.toString();
  return request<ListPaymentsResponse>(`/payments${q ? `?${q}` : ''}`);
}
