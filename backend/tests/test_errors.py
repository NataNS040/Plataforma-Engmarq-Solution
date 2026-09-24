from fastapi.testclient import TestClient
from pydantic import BaseModel


def test_not_found_uses_error_envelope(client):
    response = client.get("/api/v1/missing")
    assert response.status_code == 404
    assert response.json() == {"error": {"code": "http_404", "message": "Not Found", "details": []}}


def test_validation_does_not_echo_input(app, client):
    class Payload(BaseModel):
        count: int

    @app.post("/_test/validation")
    def validate(payload: Payload):
        return payload

    response = client.post("/_test/validation", json={"count": "private-test-value"})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
    assert response.json()["error"]["details"][0]["field"] == "body.count"
    assert "private-test-value" not in response.text


def test_internal_errors_do_not_expose_exception(app):
    @app.get("/_test/failure")
    def fail():
        raise RuntimeError("private-test-value")

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get("/_test/failure")
    assert response.status_code == 500
    assert response.json()["error"]["code"] == "internal_error"
    assert "private-test-value" not in response.text
