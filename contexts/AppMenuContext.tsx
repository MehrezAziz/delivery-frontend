import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { View } from 'react-native';
import { AppSideMenu, type AppMenuRole } from '../components/AppSideMenu';

type MenuLayout = {
  topOffset: number;
  bottomOffset: number;
  role: AppMenuRole;
};

type Ctx = {
  visible: boolean;
  toggle: () => void;
  close: () => void;
  setLayout: (layout: MenuLayout) => void;
};

const AppMenuContext = createContext<Ctx | null>(null);

export function useAppMenu() {
  const v = useContext(AppMenuContext);
  if (!v) throw new Error('useAppMenu must be used within AppMenuProvider');
  return v;
}

export function AppMenuProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [layout, setLayoutState] = useState<MenuLayout>({
    topOffset: 0,
    bottomOffset: 0,
    role: 'customer',
  });

  const setLayout = useCallback((next: MenuLayout) => {
    setLayoutState(next);
  }, []);

  const toggle = useCallback(() => setVisible((v) => !v), []);
  const close = useCallback(() => setVisible(false), []);

  const value = useMemo(() => ({ visible, toggle, close, setLayout }), [visible, toggle, close, setLayout]);

  return (
    <AppMenuContext.Provider value={value}>
      <View style={{ flex: 1 }}>
        {children}
        <AppSideMenu
          visible={visible}
          onClose={close}
          role={layout.role}
          topOffset={layout.topOffset}
          bottomOffset={layout.bottomOffset}
        />
      </View>
    </AppMenuContext.Provider>
  );
}
