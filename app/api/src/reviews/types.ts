export interface Review {
  reviewId: string;
  bookingId: string;
  reviewerId: string;
  revieweeId: string;
  rating: number;
  text: string;
  createdAt: string;
}
