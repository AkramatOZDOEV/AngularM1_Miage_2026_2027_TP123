// Conserver le vrai composant, son template et TrackService ; simuler uniquement HTTP et les fenêtres.
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpEventType, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TracksPageComponent } from './tracks-page';
import { Track } from '../../shared/models/track.model';
describe('TracksPage : suppression et upload', () => {
  let fixture: ComponentFixture<TracksPageComponent>;
  let component: TracksPageComponent;
  let http: HttpTestingController;
  // Choisir automatiquement la réponse du dialogue et observer le message Material.
  const dialog = { open: vi.fn() };
  const snackBar = { open: vi.fn() };
  const track: Track = { id: 'piste-test', title: 'Blues', originalName: 'blues.mp3', mimeType: 'audio/mpeg', size: 100, createdAt: '2026-01-01T00:00:00Z' };
  beforeEach(async () => {
    vi.resetAllMocks();
    await TestBed.configureTestingModule({ imports: [TracksPageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(),
        { provide: MatDialog, useValue: dialog }, { provide: MatSnackBar, useValue: snackBar }],
    }).overrideProvider(MatSnackBar, { useValue: snackBar }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(TracksPageComponent);
    component = fixture.componentInstance;
    // Répondre au chargement initial déclenché par le constructeur.
    http.expectOne('/api/tracks?page=1&limit=5').flush({ items: [track], page: 1, limit: 5, total: 1, pages: 1 });
    fixture.detectChanges();
  });
  // Nettoyer chaque scénario et vérifier les requêtes restantes.
  afterEach(() => { http.verify(); fixture.destroy(); vi.restoreAllMocks(); });
  it('supprime après confirmation et recharge la liste après le 204', () => {
    dialog.open.mockReturnValue({ afterClosed: () => of(true) });
    component.confirmDelete(track);
    const req = http.expectOne('/api/tracks/piste-test');
    expect(req.request.method).toBe('DELETE');
    expect(component.deleting()).toBe(track.id);
    // Le second clic ne doit pas provoquer un deuxième DELETE.
    component.confirmDelete(track);
    http.expectNone('/api/tracks/piste-test');
    req.flush(null, { status: 204, statusText: 'No Content' });
    const reload = http.expectOne('/api/tracks?page=1&limit=5');
    expect(reload.request.method).toBe('GET');
    reload.flush({ items: [], page: 1, limit: 5, total: 0, pages: 1 });
    fixture.detectChanges();
    expect(component.tracks()).toEqual([]);
    expect(component.deleting()).toBe('');
    expect(snackBar.open).toHaveBeenCalledWith('Morceau supprimé.', 'Fermer', { duration: 5000 });
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Aucune piste.');
  });
  // Une annulation doit conserver les données et ne pas contacter la route DELETE.
  it('ne supprime rien après annulation', () => {
    dialog.open.mockReturnValue({ afterClosed: () => of(false) });
    component.confirmDelete(track);
    http.expectNone(r => r.method === 'DELETE');
    expect(component.tracks()).toEqual([track]);
    expect(component.confirmingDelete()).toBe(false);
  });
  it('affiche 25 %, bloque le double envoi et gère une erreur 400', () => {
    // Créer un fichier en mémoire uniquement pour vérifier les champs multipart.
    const file = new File(['audio de test'], 'blues.mp3', { type: 'audio/mpeg' });
    const root = fixture.nativeElement as HTMLElement;
    const input = root.querySelector<HTMLInputElement>('#track-file')!;
    component.selectedFile.set(file);
    component.title.setValue('Blues');
    component.upload(input);
    const req = http.expectOne('/api/tracks');
    expect(req.request.method).toBe('POST');
    expect(req.request.reportProgress).toBe(true);
    const body = req.request.body as FormData;
    expect(body.get('audio')).toBe(file);
    expect(body.get('title')).toBe('Blues');
    // Injecter un événement de progression puis une réponse HTTP en échec.
    req.event({ type: HttpEventType.UploadProgress, loaded: 25, total: 100 });
    fixture.detectChanges();
    expect(component.uploadProgress()).toBe(25);
    expect(root.querySelector('progress')?.getAttribute('value')).toBe('25');
    expect(input.disabled).toBe(true);
    component.upload(input);
    http.expectNone('/api/tracks');
    // Vérifier le journal attendu sans afficher une fausse alerte dans les résultats.
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    req.flush({ error: 'Format refusé' }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();
    expect(log).toHaveBeenCalledWith('[TracksPage] Envoi impossible', 400);
    expect(Array.from(root.querySelectorAll('[role="alert"]')).map(el => el.textContent).join(' ')).toContain('Le serveur a refusé le fichier (400)');
    expect(component.uploading()).toBe(false);
    expect(input.disabled).toBe(false);
    expect(component.selectedFile()).toBe(file);
    expect(component.title.value).toBe('Blues');
  });
});

