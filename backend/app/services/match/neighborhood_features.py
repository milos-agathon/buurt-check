from __future__ import annotations

from dataclasses import dataclass

from app.models.match import Neighborhood, NeighborhoodFeatureVector, SeedImportResult
from app.services.match.providers.seed import MVP_REGION_CONFIG_ID, SeedMockImporter

DATA_VERSION = "match-seed-v1"


@dataclass(frozen=True)
class NeighborhoodFeatureMatrix:
    neighborhoods: list[Neighborhood]
    feature_vectors: list[NeighborhoodFeatureVector]
    data_version: str
    source_context: SeedImportResult


class NeighborhoodFeatureStore:
    async def load_matrix(self) -> NeighborhoodFeatureMatrix:
        seed = await SeedMockImporter().load_seed_data(MVP_REGION_CONFIG_ID)
        return NeighborhoodFeatureMatrix(
            neighborhoods=seed.neighborhoods,
            feature_vectors=seed.feature_vectors,
            data_version=DATA_VERSION,
            source_context=seed,
        )
