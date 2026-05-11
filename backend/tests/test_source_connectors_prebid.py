from app.services.source_connectors.pdok_sources import PdokParcelConnector


def test_pdok_wfs_records_are_minimized_source_records():
    connector = PdokParcelConnector()
    records = connector._parse_feature_collection(
        "kadastralekaart:Perceel",
        {
            "features": [
                {
                    "id": "parcel.1",
                    "properties": {
                        "omschrijving": "Cadastral parcel near the address",
                        "status": "checked",
                        "registratiedatum": "2026-05-01",
                        "raw_blob": {"not": "stored"},
                    },
                }
            ]
        },
    )

    assert len(records) == 1
    assert records[0].source_id == "pdok_parcel"
    assert records[0].record_id == "parcel.1"
    assert records[0].title == "Cadastral parcel near the address"
    assert records[0].status_label == "checked"
    assert records[0].source_date == "2026-05-01"
    assert "raw_blob" not in records[0].evidence_payload["properties"]
