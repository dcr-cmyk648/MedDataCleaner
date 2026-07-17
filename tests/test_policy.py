from med_data_cleaner.deid.policy import POLICY_ID, load_policy


def test_bundled_policy_has_all_safe_harbor_categories() -> None:
    policy = load_policy()

    assert policy["policy_id"] == POLICY_ID
    assert policy["certifies_compliance"] is False
    assert [category["number"] for category in policy["categories"]] == list(range(1, 19))
