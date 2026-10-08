import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Page } from '../models/page.model';
import { Track } from '../models/track.model';

/** Encapsulates all HTTP operations for backing tracks. */
@Injectable({ providedIn: 'root' })
export class TrackService {
  private readonly http = inject(HttpClient);

  list(page = 1, limit = 5) {
    return this.http.get<Page<Track>>('/api/tracks', {
      params: { page, limit },
    });
  }

  upload(file: File, title: string) {
    const body = new FormData();
    body.append('audio', file);
    body.append('title', title);
    // Les événements HTTP distinguent progression du transfert et réponse finale.
    return this.http.post<Track>('/api/tracks', body, { observe: 'events', reportProgress: true });
  }

  audio(id: string) {
    return this.http.get(`/api/tracks/${id}/audio`, {
      responseType: 'blob',
    });
  }

  // DELETE utilise l'intercepteur JWT et ne reçoit aucun corps après le succès 204.
  remove(id: string) {
    return this.http.delete<void>(`/api/tracks/${id}`);
  }

  // La couverture utilise une route séparée pour conserver le multipart audio existant.
  uploadCover(id: string, file: File) {
    const body = new FormData();
    body.append('cover', file);
    return this.http.put<Track>(`/api/tracks/${id}/cover`, body);
  }

  // HttpClient ajoute le JWT avant de récupérer l'image privée sous forme de Blob.
  cover(id: string) {
    return this.http.get(`/api/tracks/${id}/cover`, { responseType: 'blob' });
  }
}
