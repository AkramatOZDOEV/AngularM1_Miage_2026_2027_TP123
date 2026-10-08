/** Audio track metadata returned by the API. */
export interface Track {
  id: string;
  title: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  // Une date indique la présence de la couverture et change lors de son remplacement.
  coverUpdatedAt?: string | null;
}
