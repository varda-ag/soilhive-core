import { Navigate, Route, Routes } from 'react-router';
import { ADMIN_ROUTES, LOOK_AND_FEEL_ROUTES } from '../../../configuration/admin';
import { ColorsTab, LogoTab } from './tabs';
import { LookAndFeelLayout } from './LookAndFeelLayout';

export function LookAndFeel() {
  return (
    <Routes>
      <Route element={<LookAndFeelLayout />}>
        <Route index element={<Navigate to={LOOK_AND_FEEL_ROUTES.LOGO} replace />} />
        <Route path={LOOK_AND_FEEL_ROUTES.LOGO} element={<LogoTab />} />
        <Route path={LOOK_AND_FEEL_ROUTES.COLORS} element={<ColorsTab />} />
        <Route path="*" element={<Navigate to={ADMIN_ROUTES.LOOK_AND_FEEL} replace />} />
      </Route>
    </Routes>
  );
}
