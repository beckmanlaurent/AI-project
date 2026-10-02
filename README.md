# Labo de lumière

Un petit labo en 2D pour jouer avec la lumière : une ou plusieurs sources, des miroirs, des prismes et un réseau de diffraction. Les rayons se recalculent en direct.

Site statique : HTML, CSS et JavaScript, sans bibliothèque, sans serveur, sans clé d'API.

## Contenu du dossier

```
labo-lumiere/
├── index.html      page, barre d'outils et panneau de réglages
├── style.css   mise en forme (thème sombre, mobile)
├── app.js       optique, dessin et interaction
└── README.md       ce fichier
```

## Lancer en local

Double-clique sur `index.html`. Aucun serveur n'est nécessaire, car le JavaScript est un seul fichier classique (pas de modules).

## Utilisation

- **Ajouter** : boutons « + Source », « + Miroir », « + Verre », « + Réseau », « + Filtre », « + Écran ».
- **Déplacer** : glisser un objet.
- **Sélectionner** : toucher un objet. Des poignées apparaissent :
  - source : la poignée donne la direction du faisceau ;
  - miroir et réseau : les deux extrémités ;
  - prisme : la poignée au-dessus de la pointe le fait tourner.
- **Régler** : le panneau change selon l'objet :
  - source : lumière blanche ou couleur pure ;
  - miroir : courbure (miroir courbe) et part réfléchie (semi-miroir si elle est inférieure à 100 %) ;
  - verre : forme (prisme, bloc, bille ou goutte, lentille convergente ou divergente), taille, indice, dispersion ;
  - réseau : traits par millimètre ;
  - filtre : la couleur qu'il laisse passer.
- **Supprimer** : bouton « Supprimer », ou touche Suppr. **Échap** désélectionne.

## Ce que le site calcule

- **Réflexion** : loi de la réflexion, miroir parfait.
- **Réfraction** : loi de Snell-Descartes, réflexion totale interne, réflexion partielle (formules de Fresnel).
- **Dispersion** : loi de Cauchy, n(λ) = A + B/λ². Elle est volontairement exagérée pour que l'arc-en-ciel se voie.
- **Diffraction** : un réseau envoie la lumière dans des ordres discrets, avec sin θm = sin θi + m·λ/pas. Les angles sont justes, mais la répartition des intensités est simplifiée, et la diffraction (phénomène ondulatoire) est représentée par des rayons.

- **Lentilles, billes, blocs** : de vrais polygones de verre, réfractés à chaque face. La lentille convergente rapproche les rayons de son axe, et la divergente les écarte. Une bille d'indice 1,33 se comporte comme une goutte d'eau.
- **Miroir courbe** : un arc parabolique (concentre les rayons parallèles à son axe en un point, le foyer), découpé en 48 petits miroirs plats. Il est concave d'un côté et convexe de l'autre.
- **Semi-miroir** : réfléchit une part de la lumière et laisse passer le reste.
- **Filtre** : laisse passer une bande de couleurs autour de la sienne et absorbe les autres.
- **Écran** : arrête les rayons et affiche une tache de la couleur reçue. Les taches voisines ou superposées s'additionnent.

Les réglages de départ sont regroupés dans l'objet `CONFIG`, en haut de `app.js`.

## Publier en ligne (HTTPS gratuit)

Trois hébergeurs gratuits adaptés à un site statique : **GitHub Pages**, **Cloudflare Pages** et **Netlify**. Leurs interfaces changent régulièrement : suis leur documentation officielle pour les étapes exactes.

Exemple avec GitHub Pages :

1. Crée un dépôt public sur GitHub.
2. Envoie-y le contenu du dossier, avec `index.html` **à la racine** du dépôt.
3. Dans *Settings → Pages*, choisis de publier depuis la branche principale, à la racine.
4. Attends une minute : le site est disponible à l'adresse `https://ton-nom.github.io/nom-du-depot/`. Vérifie que l'option **Enforce HTTPS** est cochée.

## Liste de contrôle avant publication

- `index.html`, `css/style.css` et `js/app.js` sont à la racine
- Les noms de fichiers et de dossiers sont **en minuscules** : les serveurs Linux distinguent la casse (`App.js` et `app.js` sont deux fichiers différents).
- Ouvre le site publié, puis la console du navigateur (F12) : aucune erreur en rouge.
- Teste sur téléphone : glisser un objet, ouvrir le panneau, ajouter un réseau.
- Aucune requête vers un autre site : le site utilise la police du système et aucune bibliothèque externe.