import React, { createContext, useContext, useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const CustomerTabBarInsetContext = createContext(0);

/** Height of the floating tab pill (matches `(customer)/_layout.tsx`). */
export function getCustomerTabBarVisualHeight(bottomInset: number): number {
  return 58 + (bottomInset > 0 ? 6 : 0);
}

/** Space from the screen bottom to above the tab bar (safe area + pill + gap). */
export function getCustomerTabBarContentInset(bottomInset: number): number {
  const gapAbovePill = 14;
  return bottomInset + getCustomerTabBarVisualHeight(bottomInset) + gapAbovePill;
}

export function CustomerTabBarInsetProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const value = useMemo(() => getCustomerTabBarContentInset(insets.bottom), [insets.bottom]);
  return (
    <CustomerTabBarInsetContext.Provider value={value}>
      {children}
    </CustomerTabBarInsetContext.Provider>
  );
}

export function useCustomerTabBarInset(): number {
  return useContext(CustomerTabBarInsetContext);
}
