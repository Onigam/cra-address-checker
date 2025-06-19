# Architecture du Service API CRA

## Vue d'ensemble

Le service API CRA (Community Reinvestment Act) détermine si une adresse donnée est éligible au CRA en vérifiant si elle appartient à une zone à revenu faible ou modéré (LMI). Le service utilise des données ouvertes du gouvernement américain.

## Composants principaux

### 1. API du géocodeur du recensement américain
- **URL**: `https://geocoding.geo.census.gov/geocoder/geographies/address`
- **Fonction**: Convertir une adresse en coordonnées géographiques et obtenir le GEOID du secteur de recensement
- **Paramètres requis**:
  - `street`: Nom de la rue et numéro
  - `city`: Ville
  - `state`: État
  - `zip`: Code postal (optionnel)
  - `benchmark`: `Public_AR_Current`
  - `vintage`: `ACS2023_Current` ou `Current_Current`
  - `format`: `json`

### 2. API ArcGIS REST du HUD pour les données LMI
- **URL**: `https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/LOW_MOD_INCOME_BY_TRACT/FeatureServer/0/query`
- **Fonction**: Obtenir les informations LMI pour un secteur de recensement donné
- **Paramètres requis**:
  - `where`: Clause WHERE pour filtrer par GEOID du secteur de recensement
  - `outFields`: Champs à retourner (GEOID, Lowmod, etc.)
  - `f`: Format de sortie (`json`)

## Architecture du service Flask

### Endpoints

#### 1. `/api/cra/check` (POST)
Vérifie l'éligibilité CRA d'une adresse.

**Requête**:
```json
{
  "address": {
    "street": "1600 Amphitheatre Parkway",
    "city": "Mountain View",
    "state": "CA",
    "zip": "94043"
  }
}
```

**Réponse**:
```json
{
  "eligible": true,
  "address": {
    "street": "1600 Amphitheatre Parkway",
    "city": "Mountain View",
    "state": "CA",
    "zip": "94043"
  },
  "census_tract": {
    "geoid": "06085504601",
    "name": "Census Tract 5046.01"
  },
  "lmi_data": {
    "low_mod_income_percentage": 45.2,
    "is_lmi_area": false,
    "threshold": 51.0
  },
  "coordinates": {
    "latitude": 37.423120361623,
    "longitude": -122.083521249656
  },
  "timestamp": "2025-06-18T15:20:00Z"
}
```

#### 2. `/api/cra/health` (GET)
Vérification de l'état du service.

**Réponse**:
```json
{
  "status": "healthy",
  "timestamp": "2025-06-18T15:20:00Z",
  "version": "1.0.0"
}
```

### Logique métier

1. **Validation de l'adresse**: Vérifier que les champs requis sont présents
2. **Géocodage**: Utiliser l'API du géocodeur du recensement pour obtenir le GEOID
3. **Recherche LMI**: Interroger l'API ArcGIS du HUD avec le GEOID
4. **Détermination de l'éligibilité**: 
   - Une zone est considérée comme LMI si 51% ou plus des ménages gagnent moins de 80% du revenu médian de la zone (AMI)
   - Si `Lowmod` >= 51%, alors éligible au CRA
5. **Formatage de la réponse**: Retourner les informations structurées

### Gestion des erreurs

- **400 Bad Request**: Adresse invalide ou manquante
- **404 Not Found**: Adresse non trouvée dans le géocodeur
- **500 Internal Server Error**: Erreur lors de l'appel aux APIs externes
- **503 Service Unavailable**: APIs externes indisponibles

### Configuration

```python
# Configuration des APIs externes
CENSUS_GEOCODER_URL = "https://geocoding.geo.census.gov/geocoder/geographies/address"
HUD_LMI_API_URL = "https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/LOW_MOD_INCOME_BY_TRACT/FeatureServer/0/query"

# Paramètres par défaut
DEFAULT_BENCHMARK = "Public_AR_Current"
DEFAULT_VINTAGE = "ACS2023_Current"
LMI_THRESHOLD = 51.0  # Pourcentage seuil pour déterminer si une zone est LMI
```

### Dépendances Python

- `flask`: Framework web
- `requests`: Appels HTTP aux APIs externes
- `flask-cors`: Support CORS
- `python-dotenv`: Gestion des variables d'environnement

## Déploiement

Le service sera déployé en utilisant l'utilitaire `manus-create-flask-app` et configuré pour:
- Écouter sur `0.0.0.0` pour l'accès externe
- Supporter les requêtes CORS
- Gérer les timeouts et retry pour les APIs externes
- Logger les requêtes et erreurs

## Sécurité

- Validation stricte des entrées
- Limitation du taux de requêtes (rate limiting)
- Logs d'audit pour toutes les requêtes
- Pas de stockage de données personnelles

