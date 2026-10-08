import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../shared/services/auth.service';

@Component({
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login-page.html',
  styleUrl: './login-page.css',
})
export class LoginPageComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  // Lit la raison de redirection fournie par l'intercepteur.
  private readonly route = inject(ActivatedRoute);

  // Le message est générique : aucun token ni détail secret ne passe dans l'URL.
  readonly error = signal(
    this.route.snapshot.queryParamMap.get('session') === 'expired'
      ? 'Ta session est invalide ou expirée. Connecte-toi à nouveau.'
      : '',
  );
  readonly pending = signal(false);
  readonly form = new FormGroup({
    email: new FormControl('demo@example.com', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl('Demo1234!', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  submit(): void {
    if (this.pending()) return;
    this.error.set('');

    // Rend visibles les erreurs, puis bloque tout appel HTTP si la saisie est invalide.
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const values = this.form.getRawValue();
    this.pending.set(true);
    this.auth.login(values.email, values.password)
      .pipe(finalize(() => this.pending.set(false)))
      .subscribe({
        next: () => {
          console.debug('[LoginPage] Connexion réussie');
          // Affiche la bibliothèque après une connexion réussie.
          void this.router.navigateByUrl('/tracks');
        },
        error: (error: HttpErrorResponse) => {
          // Le statut suffit au diagnostic ; ne pas journaliser les identifiants ou tokens.
          console.error('[LoginPage] Échec HTTP', error.status);
          if (error.status === 0) {
            this.error.set('Impossible de joindre le serveur. Vérifie que le backend est démarré.');
          } else if (error.status === 401) {
            this.error.set('Email ou mot de passe incorrect.');
          } else if (error.status === 400) {
            this.error.set('Les informations envoyées sont invalides. Vérifie les champs du formulaire.');
          } else {
            this.error.set('Une erreur du serveur empêche la connexion. Réessaie plus tard.');
          }
        },
      });
  }
}
