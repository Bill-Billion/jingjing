import '../account/fake_account_api.dart';
import '../artists/artists_fixtures.dart';

Map<String, dynamic> eligibility(
        {bool approved = true,
        String person = personKey,
        String party = personId}) =>
    {
      'person_id': person,
      'seller_party_id': party,
      'identity_verified': true,
      'l1_verified': true,
      'manual_review_approved': approved,
      'eligible': approved,
      'blocking_reasons':
          approved ? <String>[] : ['STOCK_HALO_REVIEW_REQUIRED'],
      'policy_version': 'CONTRACT_20261029',
    };
