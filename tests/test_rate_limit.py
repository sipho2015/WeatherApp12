from fastapi.testclient import TestClient

import src.main as main_module


def test_rate_limit_middleware_blocks_excess_requests():
    main_module.RATE_LIMIT_REQUESTS = 2
    main_module.RATE_LIMIT_WINDOW_SECONDS = 60
    main_module._rate_limit_buckets.clear()

    client = TestClient(main_module.app)

    first = client.get("/preferences")
    second = client.get("/preferences")
    third = client.get("/preferences")

    assert first.status_code in {200, 500}
    assert second.status_code in {200, 500}
    assert third.status_code == 429
