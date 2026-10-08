# Contrat HTTP - TP1 et TP2

Base : `/api`. Sauf inscription et connexion, envoyer `Authorization: Bearer <token>`.

Le contrat HTTP ne dépend pas du choix de persistance : le backend fourni utilise Mongoose et MongoDB. MongoDB conserve les utilisateurs et métadonnées ; les octets des fichiers audio restent sur le disque du serveur.

| Méthode | Route | Requête | Réponse principale |
|---|---|---|---|
| GET | `/health` | - | `{ "status": "ok" }` |
| POST | `/auth/register` | `{name,email,password}` | `201 {token,user}` |
| POST | `/auth/login` | `{email,password}` | `200 {token,user}` |
| GET | `/users/me` | JWT | `200 User` |
| PUT | `/users/me` | `{name}` + JWT | `200 User` |
| GET | `/tracks?page=1&limit=5` | JWT | `Page<Track>` |
| POST | `/tracks` | multipart : `audio`, `title` | `201 Track` |
| GET | `/tracks/:id/audio` | JWT | flux audio |
| DELETE | `/tracks/:id` | JWT | `204` (bonus) |
| PUT | `/tracks/:id/cover` | multipart : `cover` + JWT | `200 Track` |
| GET | `/tracks/:id/cover` | JWT propriétaire | `200 image/jpeg` |

`Page<Track>` contient `items`, `page`, `limit`, `total` et `pages`. Formats acceptés : MP3, WAV, OGG et M4A, 25 Mo maximum.

Erreurs courantes : `400` validation, `401` authentification, `404` ressource, `409` email déjà utilisé.

## Extension TP2 : couvertures

Les routes audio existantes conservent leur contrat : POST `/api/tracks` contient exactement `audio` et `title`. L'image est envoyée ensuite, ou remplacée depuis une card.

### PUT `/api/tracks/:id/cover`

- Authentification : `Authorization: Bearer <token>`, vérification du propriétaire avant de recevoir le fichier.
- Paramètre : `id`, identifiant MongoDB de la piste.
- Corps : `multipart/form-data`, un seul champ fichier nommé `cover`, aucun champ texte requis.
- Formats : JPEG ou PNG, 5 × 1024 × 1024 octets maximum, 4 millions de pixels maximum.
- Contrôles : MIME, signature, décodage réel, dimensions. L'image est réduite à 800 pixels sur son plus grand côté et réencodée en JPEG sans métadonnées d'origine.
- Succès : `200 Track`, avec `coverUpdatedAt` (date ISO). L'ancienne couverture est supprimée après mise à jour.
- Erreurs : `400` fichier absent, format, contenu, dimensions, multipart ou taille invalides ; `401` JWT absent/invalide ; `404` identifiant invalide, piste absente ou autre propriétaire ; `500` erreur disque/base.

### GET `/api/tracks/:id/cover`

- Authentification : JWT et même contrôle de propriété ; paramètre `id`, aucun corps.
- Succès : `200 image/jpeg`, `Cache-Control: private, no-store`.
- Erreurs : `401` JWT absent/invalide ; `404` piste inconnue/interdite ou couverture absente ; erreur serveur en cas de panne disque.
- Angular récupère un Blob via HttpClient et affiche une ObjectURL locale ; aucune URL publique vers le disque.

### Métadonnées et suppression

`Track` conserve ses champs et ajoute `coverUpdatedAt: string | null` (ou absent pour les anciennes réponses). Les noms techniques `storedName` et `coverStoredName` ne sont jamais renvoyés par la liste ni par `toPublic()`.

DELETE `/api/tracks/:id` : JWT propriétaire, aucun corps, `204` sans contenu ; retire métadonnées, audio et couverture. `401` sans JWT, `404` piste absente/interdite. Un échec de nettoyage disque peut donner `500` après suppression des métadonnées : le frontend recharge alors la liste. Une confirmation est demandée avant le DELETE.
