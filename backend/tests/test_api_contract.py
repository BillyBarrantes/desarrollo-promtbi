from app.main import app


def test_public_api_paths_and_methods_are_stable():
    schema = app.openapi()
    paths = schema["paths"]

    expected_methods = {
        "/api/v1/layouts/generate": {"post"},
        "/api/v1/layouts/iterate": {"post"},
        "/api/v1/layouts/export/dxf": {"post"},
        "/api/v1/health": {"get"},
    }

    assert set(expected_methods).issubset(paths)

    for path, methods in expected_methods.items():
        assert methods.issubset(set(paths[path]))


def test_generate_and_iterate_have_success_responses():
    schema = app.openapi()

    generate = schema["paths"]["/api/v1/layouts/generate"]["post"]
    iterate = schema["paths"]["/api/v1/layouts/iterate"]["post"]

    assert "200" in generate["responses"]
    assert "200" in iterate["responses"]


def test_export_and_health_contracts():
    schema = app.openapi()

    export_dxf = schema["paths"]["/api/v1/layouts/export/dxf"]["post"]
    health = schema["paths"]["/api/v1/health"]["get"]

    assert "200" in export_dxf["responses"]
    assert "200" in health["responses"]
    assert health["responses"]["200"]["content"]["application/json"]
