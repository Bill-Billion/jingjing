import 'package:integration_test/integration_test.dart';
import '../test/finance/finance_download_test.dart' as finance;
import '../test/gigs/gig_download_test.dart' as gigs;
import '../test/projects/project_download_test.dart' as projects;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  finance.main();
  gigs.main();
  projects.main();
}
