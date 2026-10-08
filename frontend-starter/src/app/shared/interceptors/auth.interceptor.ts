import { inject } from '@angular/core';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

/** Ajoute le JWT aux appels API protégés et ferme une session refusée par le serveur. */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const token = auth.token();

  // Les services utilisent des URL /api relatives ; ne jamais envoyer le JWT à un autre site.
  const path = request.url.split('?')[0];
  const publicPaths = ['/api/health', '/api/auth/login', '/api/auth/register'];
  const protectedApi = path.startsWith('/api/') && !publicPaths.includes(path);
  const authenticatedRequest = protectedApi && token
    ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : request;

  return next(authenticatedRequest).pipe(
    catchError((error: unknown) => {
      // Un 401 de login signifie de mauvais identifiants : seul le composant doit le gérer.
      // Comparer les tokens évite qu'une ancienne requête déconnecte une nouvelle session.
      if (protectedApi && error instanceof HttpErrorResponse && error.status === 401
          && auth.token() === token) {
        // Nettoie le stockage et les Signals sans afficher le JWT dans les logs.
        auth.logout();
        // Quitte la page protégée et indique pourquoi une nouvelle connexion est nécessaire.
        void router.navigate(['/login'], {
          queryParams: { session: 'expired' },
          replaceUrl: true,
        });
      }

      // Laisse aussi le composant terminer son traitement d'erreur et son indicateur de chargement.
      return throwError(() => error);
    }),
  );
};
