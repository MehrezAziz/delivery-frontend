import { Redirect } from 'expo-router';

/** Tab-bar shortcut — navigates to the full create-order flow. */
export default function NewOrderTab() {
  return <Redirect href="/(customer)/create-order" />;
}
