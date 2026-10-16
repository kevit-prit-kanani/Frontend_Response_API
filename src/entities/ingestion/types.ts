export interface ScrapeResponse {
  session_id: string;
  vector_store_id: string;
  pages_scraped: number;
  pages_uploaded: number;
  pages_skipped: number;
}
