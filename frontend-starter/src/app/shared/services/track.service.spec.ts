// Le transport HTTP est simulé : aucun appel à Express ou MongoDB.
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TrackService } from './track.service';
describe('TrackService : pagination', () => {
  let http: HttpTestingController;
  // Remplacer le transport après avoir fourni HttpClient.
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });
  // Détecter les requêtes inattendues laissées sans réponse.
  afterEach(() => http.verify());
  it('transmet page et limit et restitue la réponse', () => {
    const received = vi.fn();
    TestBed.inject(TrackService).list(2, 5).subscribe({ next: received });
    const req = http.expectOne('/api/tracks?page=2&limit=5');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('limit')).toBe('5');
    // flush fournit la réponse simulée sans réseau.
    const response = { items: [], page: 2, limit: 5, total: 0, pages: 1 };
    req.flush(response);
    expect(received).toHaveBeenCalledExactlyOnceWith(response);
  });
});
