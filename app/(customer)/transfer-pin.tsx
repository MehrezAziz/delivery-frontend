import { Redirect } from 'expo-router';

/** Transfer PIN is managed under Settings → Security. */
export default function TransferPinRedirect() {
  return <Redirect href="/(customer)/security" />;
}
