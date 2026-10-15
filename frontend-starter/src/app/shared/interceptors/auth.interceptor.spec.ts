// Le vrai intercepteur travaille avec un transport simulé.
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from '../services/auth.service';
describe('Intercepteur : Authorization', () => {
  let http: HttpTestingController;
  // Valeur fictive, sans accès à un compte réel ni au stockage du navigateur utilisateur.
  const auth = { token: signal<string | null>('token-fictif-test'), logout: vi.fn() };
  beforeEach(() => {
    auth.token.set('token-fictif-test');
    TestBed.configureTestingModule({ providers: [provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(), provideRouter([]), { provide: AuthService, useValue: auth }] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('ajoute Authorization sur une route protégée', () => {
    const received = vi.fn();
    TestBed.inject(HttpClient).get('/api/tracks').subscribe({ next: received });
    const req = http.expectOne('/api/tracks');
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe('Bearer token-fictif-test');
    req.flush({ items: [] });
    expect(received).toHaveBeenCalledExactlyOnceWith({ items: [] });
  });
  // Le cas sans token protège contre un header contenant une valeur vide ou null.
  it('ne crée pas de header sans token', () => {
    auth.token.set(null);
    TestBed.inject(HttpClient).get('/api/tracks').subscribe();
    const req = http.expectOne('/api/tracks');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({ items: [] });
  });
});
