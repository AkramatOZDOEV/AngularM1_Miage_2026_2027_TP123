import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

// Le dialogue Material gère le focus, le clavier et l'annulation avant DELETE.
@Component({
  imports: [MatDialogModule, MatButtonModule],
  templateUrl: './delete-dialog.html',
  styleUrl: './delete-dialog.css',
})
export class DeleteDialogComponent {
  // Le titre est affiché comme du texte Angular, sans injection HTML.
  readonly title = inject<string>(MAT_DIALOG_DATA);
}
