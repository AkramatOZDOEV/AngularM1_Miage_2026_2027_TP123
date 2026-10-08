import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from '../../shared/services/auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class AppComponent {
  // Le template lit le Signal token pour adapter la navigation à la session locale.
  readonly auth = inject(AuthService);
  // Le routeur permet de quitter la page protégée après la déconnexion.
  private readonly router = inject(Router);

  logout(): void {
    // Supprime gpc_token du stockage et remet token et currentUser à null.
    this.auth.logout();
    // Remplace la page courante dans l'historique par la page de connexion.
    void this.router.navigateByUrl('/login', { replaceUrl: true });
  }
}
