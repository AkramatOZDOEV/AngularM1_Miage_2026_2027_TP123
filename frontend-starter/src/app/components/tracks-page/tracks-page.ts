import { Component, DestroyRef, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
// HttpEventType identifie les octets envoyés et la réponse finale.
import { HttpErrorResponse, HttpEventType } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { finalize, Subscription } from 'rxjs';
import { Track } from '../../shared/models/track.model';
import { TrackService } from '../../shared/services/track.service';
// Material fournit une pagination accessible et une confirmation avec gestion du focus.
import { MatPaginatorIntl, MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatDialog } from '@angular/material/dialog';
import { DeleteDialogComponent } from '../delete-dialog/delete-dialog';

// Les libellés et les annonces du Paginator sont disponibles en français.
function frenchPaginator(): MatPaginatorIntl {
  const labels = new MatPaginatorIntl();
  labels.itemsPerPageLabel = 'Morceaux par page';
  labels.nextPageLabel = 'Suivant';
  labels.previousPageLabel = 'Précédent';
  labels.firstPageLabel = 'Première page';
  labels.lastPageLabel = 'Dernière page';
  labels.getRangeLabel = (page, size, length) => length === 0 ? '0 morceau' : `${page * size + 1}–${Math.min((page + 1) * size, length)} sur ${length}`;
  return labels;
}

@Component({
  // DatePipe rend la date des pistes lisible dans le template.
  imports: [ReactiveFormsModule, DatePipe, MatPaginatorModule],
  // Cette traduction reste locale à la bibliothèque.
  providers: [{ provide: MatPaginatorIntl, useFactory: frenchPaginator }],
  templateUrl: './tracks-page.html',
  styleUrl: './tracks-page.css',
})
export class TracksPageComponent {
  private readonly service = inject(TrackService);
  // Le dialogue demande un accord explicite avant toute suppression.
  private readonly dialog = inject(MatDialog);
  // Ce contexte annule les requêtes et libère l'URL au départ de la page.
  private readonly destroyRef = inject(DestroyRef);
  private listRequest?: Subscription;
  // Seule la requête de liste la plus récente peut arrêter l'indicateur de chargement.
  private listGeneration = 0;
  readonly tracks = signal<Track[]>([]);
  readonly page = signal(1);
  readonly pages = signal(1);
  readonly loading = signal(false);
  // Les erreurs de liste sont indépendantes des erreurs d'import.
  readonly loadError = signal('');
  // Le total et la taille de page alimentent le Paginator sans découpage local.
  readonly limit = signal(5);
  readonly total = signal(0);
  readonly uploadProgress = signal<number | null>(null);
  readonly selectedCover = signal<File | null>(null);
  readonly coverError = signal('');
  readonly coverBusy = signal('');
  readonly coverUrls = signal<Record<string, string>>({});
  readonly coverFailures = signal<Record<string, boolean>>({});
  readonly deleting = signal('');
  readonly confirmingDelete = signal(false);
  readonly actionError = signal('');
  readonly actionSuccess = signal('');
  private coverRequests: Subscription[] = [];
  private audioRequest?: Subscription;
  readonly audioUrl = signal('');
  readonly title = new FormControl('', { nonNullable: true });
  // FormGroup active ngSubmit et permet un envoi par Entrée comme par le bouton.
  readonly uploadForm = new FormGroup({ title: this.title });
  // Ces états décrivent le fichier choisi, sa validation et le résultat de l'envoi.
  readonly selectedFile = signal<File | null>(null);
  readonly fileError = signal('');
  readonly uploading = signal(false);
  readonly uploadError = signal('');
  readonly uploadSuccess = signal('');
  // Ces états distinguent téléchargement, piste sélectionnée et lecture effective.
  readonly audioLoading = signal(false);
  readonly audioError = signal('');
  readonly currentTrack = signal<Track | null>(null);
  readonly playing = signal(false);
  // Les règles reproduisent la limite et les types MIME du backend.
  private readonly maxFileSize = 25 * 1024 * 1024;
  private readonly allowedTypes = new Set([
    'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/mp4', 'audio/x-m4a',
  ]);

  constructor() {
    this.load();
    // La dernière ObjectURL est révoquée quand Angular détruit la page.
    this.destroyRef.onDestroy(() => { this.releaseAudio(); this.releaseCovers(); });
  }

  choose(event: Event): void {
    // Ignore un changement de fichier pendant un envoi déjà commencé.
    if (this.uploading()) return;
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.selectedFile.set(file);
    this.fileError.set(file ? this.validateFile(file) : '');
    this.uploadError.set('');
    this.uploadSuccess.set('');
  }

  private validateFile(file: File): string {
    // Un fichier vide, trop volumineux ou d'un type refusé n'est pas envoyé.
    if (file.size === 0) return 'Ce fichier est vide. Choisis un fichier audio contenant du son.';
    if (file.size > this.maxFileSize) return 'Le fichier dépasse la limite de 25 Mo.';
    if (!this.allowedTypes.has(file.type)) return 'Format non accepté. Choisis un fichier MP3, WAV, OGG ou M4A/MP4 audio.';
    return '';
  }

  load(): void {
    // Annuler la précédente lecture empêche une réponse ancienne de remplacer la page actuelle.
    this.listRequest?.unsubscribe();
    const generation = ++this.listGeneration;
    this.loadError.set('');
    this.loading.set(true);
    this.listRequest = this.service.list(this.page(), this.limit()).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => { if (generation === this.listGeneration) this.loading.set(false); }),
    ).subscribe({
      next: (response) => {
        // Si une suppression vide la dernière page, recharger la dernière page existante.
        if (this.page() > response.pages) { this.page.set(response.pages); this.load(); return; }
        this.tracks.set(response.items);
        this.pages.set(response.pages);
        this.total.set(response.total);
        this.loadCovers(response.items);
      },
      error: (error: HttpErrorResponse) => {
        console.error('[TracksPage] Chargement impossible', error.status);
        this.loadError.set('Impossible de charger les pistes. Utilise Actualiser pour réessayer.');
      },
    });
  }

  go(page: number): void {
    // Les bornes et l'attente protègent les clics répétés sur la pagination.
    if (this.loading() || page < 1 || page > this.pages() || page === this.page()) return;
    this.page.set(page);
    this.load();
  }

  // L'index Material commence à zéro ; l'API commence à la page 1.
  paginate(event: PageEvent): void {
    if (this.loading() || this.deleting()) return;
    this.limit.set(event.pageSize);
    this.page.set(event.pageIndex + 1);
    this.load();
  }

  // Vérifier taille et format avant HTTP aide l'utilisateur ; le serveur décode le contenu réel.
  private validateCover(file: File): string {
    if (!file.size || file.size > 5 * 1024 * 1024) return 'Choisis une image non vide de 5 Mo maximum.';
    return ['image/jpeg', 'image/png'].includes(file.type) ? '' : 'Choisis une image JPEG ou PNG.';
  }

  // Le choix d'image reste facultatif et ne modifie pas le multipart audio.
  chooseCover(event: Event): void {
    if (this.uploading()) return;
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.selectedCover.set(file);
    this.coverError.set(file ? this.validateCover(file) : '');
  }

  upload(input: HTMLInputElement, coverInput?: HTMLInputElement): void {
    // Le garde bloque aussi les doubles soumissions en dehors d'un clic sur le bouton.
    if (this.uploading() || this.coverError() || this.coverBusy() || this.deleting()) return;
    const file = this.selectedFile();
    this.uploadError.set('');
    this.uploadSuccess.set('');
    if (!file) {
      this.fileError.set('Choisis un fichier audio avant de l’envoyer.');
      return;
    }
    // Revalider avant HTTP applique les règles à chaque envoi.
    const validation = this.validateFile(file);
    this.fileError.set(validation);
    if (validation) return;
    const title = this.title.value.trim() || file.name;
    this.uploading.set(true);
    // Sans total connu, le progress reste indéterminé plutôt qu'un pourcentage inventé.
    this.uploadProgress.set(null);
    const cover = this.selectedCover();
    this.service.upload(file, title).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => { if (!this.coverBusy()) this.uploading.set(false); }),
    ).subscribe({
      next: (event) => {
        // 100 % signifie transfert envoyé ; la réponse HTTP confirme l'enregistrement.
        if (event.type === HttpEventType.UploadProgress) {
          this.uploadProgress.set(event.total ? Math.round(100 * event.loaded / event.total) : null);
          return;
        }
        if (event.type !== HttpEventType.Response || !event.body) return;
        const track = event.body;
        // Le succès vide le champ fichier natif et Angular, puis recharge la première page.
        this.title.reset('');
        this.selectedFile.set(null);
        input.value = '';
        // La couverture choisie est capturée avant de vider les contrôles natifs et Angular.
        if (coverInput) coverInput.value = '';
        this.selectedCover.set(null);
        this.uploadSuccess.set(`${track.title} ajouté.`);
        this.page.set(1);
        this.load();
        if (cover) this.saveCover(track, cover, true);
      },
      error: (error: HttpErrorResponse) => {
        // Conserver fichier et titre permet un réessai sans refaire la saisie.
        console.error('[TracksPage] Envoi impossible', error.status);
        this.uploadError.set(this.httpMessage(error, 'envoyer ce fichier'));
      },
    });
  }

  play(track: Track): void {
    // Une seule récupération audio est autorisée à la fois ; l'ancienne piste est libérée.
    if (this.audioLoading()) return;
    this.releaseAudio();
    this.currentTrack.set(track);
    this.audioError.set('');
    this.audioLoading.set(true);
    this.audioRequest = this.service.audio(track.id).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.audioLoading.set(false)),
    ).subscribe({
      next: (blob) => {
        // Cette URL locale donne au lecteur accès au Blob reçu via la requête authentifiée.
        this.audioUrl.set(URL.createObjectURL(blob));
      },
      error: (error: HttpErrorResponse) => {
        console.error('[TracksPage] Lecture impossible', error.status);
        this.audioError.set(this.httpMessage(error, 'charger cet audio'));
      },
    });
  }

  audioFailed(): void {
    // Le téléchargement peut réussir même si le navigateur ne peut pas décoder le fichier.
    this.releaseAudio();
    this.audioError.set('Le navigateur ne peut pas lire ce fichier. Essaie un autre format audio.');
  }

  private releaseAudio(): void {
    // Annuler une récupération empêche un Blob supprimé de réapparaître dans le lecteur.
    this.audioRequest?.unsubscribe();
    // Révoquer l'URL évite de retenir inutilement le fichier audio en mémoire.
    const url = this.audioUrl();
    if (url) URL.revokeObjectURL(url);
    this.audioUrl.set('');
    this.playing.set(false);
  }

  // Changer une couverture depuis une card permet aussi de réessayer après un échec partiel.
  changeCover(track: Track, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.coverBusy() || this.deleting()) return;
    const error = this.validateCover(file);
    this.actionError.set(error);
    if (!error) this.saveCover(track, file, false);
  }

  // L'audio reste disponible si l'image échoue ; un message propose un réessai depuis la card.
  private saveCover(track: Track, file: File, afterUpload: boolean): void {
    this.coverBusy.set(track.id);
    this.actionError.set('');
    this.service.uploadCover(track.id, file).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => { this.coverBusy.set(''); if (afterUpload) this.uploading.set(false); }),
    ).subscribe({
      next: () => {
        if (afterUpload) { this.selectedCover.set(null); this.coverError.set(''); }
        this.actionSuccess.set('Couverture enregistrée.');
        this.load();
      },
      error: (error: HttpErrorResponse) => {
        console.error('[TracksPage] Couverture impossible', error.status);
        this.actionError.set('Couverture non enregistrée. Le morceau reste disponible. Réessaie depuis sa fiche.');
      },
    });
  }

  // Les images privées sont téléchargées uniquement pour les cards de la page affichée.
  private loadCovers(tracks: Track[]): void {
    this.releaseCovers();
    this.coverFailures.set({});
    for (const track of tracks) {
      if (!track.coverUpdatedAt) continue;
      this.coverRequests.push(this.service.cover(track.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (blob) => this.coverUrls.update(urls => ({ ...urls, [track.id]: URL.createObjectURL(blob) })),
        error: (error: HttpErrorResponse) => {
          console.error('[TracksPage] Image indisponible', error.status);
          this.coverFailures.update(states => ({ ...states, [track.id]: true }));
        },
      }));
    }
  }

  // Chaque changement de page et destruction libère les images et leurs requêtes.
  private releaseCovers(): void {
    this.coverRequests.forEach(request => request.unsubscribe());
    this.coverRequests = [];
    Object.values(this.coverUrls()).forEach(url => URL.revokeObjectURL(url));
    this.coverUrls.set({});
  }

  // Ouvrir le dialogue ne supprime rien ; annuler ou Échap ne déclenche aucun DELETE.
  confirmDelete(track: Track): void {
    if (this.confirmingDelete() || this.deleting() || this.coverBusy() || this.uploading()) return;
    this.confirmingDelete.set(true);
    this.dialog.open(DeleteDialogComponent, { data: track.title, width: '420px', maxWidth: '95vw', autoFocus: 'first-tabbable' })
      .afterClosed().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (confirmed: boolean | undefined) => {
          this.confirmingDelete.set(false);
          if (confirmed === true) this.deleteTrack(track);
        },
        error: () => { this.confirmingDelete.set(false); this.actionError.set('Confirmation indisponible.'); },
      });
  }

  // Après succès, arrêter le morceau supprimé et recalculer les bornes de pagination.
  private deleteTrack(track: Track): void {
    this.deleting.set(track.id);
    this.actionError.set('');
    this.actionSuccess.set('');
    this.service.remove(track.id).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.deleting.set(''))).subscribe({
      next: () => {
        if (this.currentTrack()?.id === track.id) { this.releaseAudio(); this.currentTrack.set(null); this.audioError.set(''); }
        this.actionSuccess.set('Morceau supprimé.');
        this.load();
      },
      error: (error: HttpErrorResponse) => {
        console.error('[TracksPage] Suppression impossible', error.status);
        this.actionError.set(this.httpMessage(error, 'supprimer ce morceau'));
        // Un 500 peut suivre une suppression MongoDB réussie avec nettoyage disque incomplet.
        this.load();
      },
    });
  }

  private httpMessage(error: HttpErrorResponse, action: string): string {
    // Des messages fixes traduisent les statuts sans exposer de données sensibles.
    if ([0, 502, 503].includes(error.status)) return 'Le serveur est indisponible. Réessaie plus tard.';
    if (error.status === 400) return 'Le serveur a refusé le fichier (400). Vérifie son format et sa taille.';
    if (error.status === 401) return 'Ta session est invalide ou expirée. Reconnecte-toi.';
    if (error.status === 404) return 'Cette piste est introuvable ou ne t’appartient pas.';
    return `Impossible de ${action}. Réessaie plus tard.`;
  }

  formatSize(bytes: number): string {
    // Convertir les octets évite de les afficher à tort comme des Ko.
    return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} Ko` : `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  }
}
