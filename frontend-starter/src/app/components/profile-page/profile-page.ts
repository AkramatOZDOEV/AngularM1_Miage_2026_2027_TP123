import { Component, inject, OnInit, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { AuthService } from '../../shared/services/auth.service';

@Component({
  imports: [ReactiveFormsModule],
  templateUrl: './profile-page.html',
  styleUrl: './profile-page.css',
})
export class ProfilePageComponent implements OnInit {
  readonly auth = inject(AuthService);
  // Ces Signals pilotent le chargement et son éventuel message d'erreur.
  readonly loading = signal(false);
  readonly loadError = signal('');
  // Sépare l'état de sauvegarde de celui du chargement du profil.
  readonly saving = signal(false);
  readonly saveError = signal('');
  readonly saveSuccess = signal('');
  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(2)] }),
  });

  ngOnInit(): void {
    // Angular appelle cette méthode à chaque création de la page Profil, même après F5.
    this.load();
  }

  load(): void {
    // Évite les chargements simultanés et efface une ancienne erreur avant de réessayer.
    if (this.loading() || this.saving()) return;
    this.loadError.set('');
    this.saveError.set('');
    this.saveSuccess.set('');
    this.loading.set(true);
    this.auth.profile()
      // Réactive l'interface après la réponse, qu'elle soit un succès ou un échec.
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (user) => {
          console.debug('[ProfilePage] Profil chargé', user.id);
          // Le service actualise currentUser ; le formulaire possède son propre état.
          this.form.setValue({ name: user.name });
        },
        error: (error: HttpErrorResponse) => {
          // Journalise uniquement le statut, sans réponse complète ni token.
          console.error('[ProfilePage] Chargement impossible, statut HTTP', error.status);
          if (error.status === 0 || error.status === 502 || error.status === 503) {
            this.loadError.set('Serveur inaccessible. Vérifie le backend, puis réessaie.');
          } else if (error.status === 401) {
            this.loadError.set('Session invalide ou expirée. Reconnecte-toi.');
          } else {
            this.loadError.set('Impossible de charger le profil. Réessaie plus tard.');
          }
        },
      });
  }

  save(): void {
    // Empêche deux enregistrements simultanés ou un enregistrement pendant le chargement.
    if (this.saving() || this.loading() || this.loadError() || !this.auth.currentUser()) return;
    this.saveError.set('');
    this.saveSuccess.set('');

    // Valide le nom sans espaces périphériques, comme le modèle Mongoose côté serveur.
    const name = this.form.controls.name.value.trim();
    this.form.controls.name.setValue(name);
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    this.saving.set(true);
    // AuthService envoie PUT /api/users/me et actualise currentUser à partir de la réponse.
    this.auth.update(name)
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (user) => {
          console.debug('[ProfilePage] Profil enregistré', user.id);
          // Réaffiche la valeur confirmée par le serveur et remet le formulaire au repos.
          this.form.reset({ name: user.name });
          this.saveSuccess.set('Ton nom a bien été enregistré.');
        },
        error: (error: HttpErrorResponse) => {
          // Conserve la saisie pour réessayer ; ne journalise aucune réponse complète.
          console.error('[ProfilePage] Enregistrement impossible, statut HTTP', error.status);
          if (error.status === 0 || error.status === 502 || error.status === 503) {
            this.saveError.set('Serveur inaccessible. Ton nom ne peut pas être enregistré pour le moment. Réessaie.');
          } else if (error.status === 401) {
            this.saveError.set('Session invalide ou expirée. Reconnecte-toi.');
          } else if (error.status === 400) {
            this.saveError.set('Le nom a été refusé. Saisis au moins 2 caractères.');
          } else if (error.status === 404) {
            this.saveError.set('Ce profil est introuvable. Reconnecte-toi.');
          } else {
            this.saveError.set('Impossible de confirmer la sauvegarde. Réessaie plus tard.');
          }
        },
      });
  }
}
