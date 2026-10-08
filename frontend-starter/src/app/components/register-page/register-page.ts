import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../shared/services/auth.service';

@Component({
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './register-page.html',
  styleUrl: './register-page.css',
})
export class RegisterPageComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly error = signal('');
  readonly pending = signal(false);
  readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2)],
    }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(8)],
    }),
  });

  submit(): void {
    if (this.pending()) return;
    this.error.set('');
    // Mongoose retire les espaces autour du nom : valider la même valeur ici.
    this.form.controls.name.setValue(this.form.controls.name.value.trim());

    // Rend visibles les erreurs, puis bloque tout appel HTTP si la saisie est invalide.
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const values = this.form.getRawValue();
    this.pending.set(true);
    this.auth.register(values.name, values.email, values.password)
      .pipe(finalize(() => this.pending.set(false)))
      .subscribe({
        next: () => {
          console.debug('[RegisterPage] Inscription réussie');
          // Affiche le profil après la création du compte.
          void this.router.navigateByUrl('/profile');
        },
        error: (error: HttpErrorResponse) => {
          // Le statut suffit au diagnostic ; ne pas journaliser les identifiants ou tokens.
          console.error('[RegisterPage] Échec HTTP', error.status);
          if (error.status === 0) {
            this.error.set('Impossible de joindre le serveur. Vérifie que le backend est démarré.');
          } else if (error.status === 409) {
            this.error.set('Cette adresse email est déjà utilisée. Connecte-toi ou utilise une autre adresse.');
          } else if (error.status === 400) {
            this.error.set('Les informations envoyées sont invalides. Vérifie les champs du formulaire.');
          } else {
            this.error.set('Une erreur du serveur empêche ton inscription. Réessaie plus tard.');
          }
        },
      });
  }
}
