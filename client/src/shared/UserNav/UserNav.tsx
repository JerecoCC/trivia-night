import { useLocation, useNavigate } from 'react-router-dom';
import Button from '@jerecocc/tracker-ui/components/Button/Button';
import Icon from '@jerecocc/tracker-ui/components/Icon/Icon';
import { useAuth } from '@/context/AuthContext';
import type { AppNavigationProps } from '@/shared/AppLayout/AppLayout';
import styles from './UserNav.module.scss';

interface NavItem {
  label: string;
  path: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: 'apps' },
  { label: 'Events', path: '/events', icon: 'calendar_month' },
  { label: 'Quizzes', path: '/quizzes', icon: 'view_list' },
];

/**
 * An icon rail on wider screens, with each label in a tooltip and sign out at the bottom.
 * On phones and tablets it slides out from the header's menu button with the labels shown.
 */
const UserNav = (props: AppNavigationProps) => {
  const { mobileOpen, onMobileClose } = props;
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { logout } = useAuth();

  const isActive = (path: string) => pathname === path || pathname.startsWith(path + '/');

  const handleNavClick = (path: string) => {
    navigate(path);
    onMobileClose();
  };

  const handleSignOut = async () => {
    onMobileClose();
    await logout();
    navigate('/login');
  };

  return (
    <nav
      className={`${styles.nav} ${mobileOpen ? styles.mobileOpen : ''}`}
      aria-label="Main"
    >
      <ul className={styles.list}>
        {NAV_ITEMS.map(({ label, path, icon }) => {
          const active = isActive(path);
          return (
            <li key={path}>
              <Button
                variant="ghost"
                intent="neutral"
                className={`${styles.navItem} ${active ? styles.active : ''}`}
                onClick={() => handleNavClick(path)}
                aria-label={label}
                aria-current={active ? 'page' : undefined}
                tooltip={mobileOpen ? undefined : label}
                tooltipClassName={styles.navTooltipWrapper}
              >
                <span className={styles.iconBadge}>
                  <Icon
                    name={icon}
                    size="1.25rem"
                    className={styles.icon}
                  />
                </span>
                <span className={styles.label}>{label}</span>
              </Button>
            </li>
          );
        })}
      </ul>

      <Button
        variant="ghost"
        intent="neutral"
        className={styles.signOut}
        onClick={() => void handleSignOut()}
        aria-label="Sign out"
        tooltip={mobileOpen ? undefined : 'Sign out'}
        tooltipClassName={styles.signOutTooltipWrapper}
      >
        <Icon
          name="logout"
          size="1.25rem"
          className={styles.icon}
        />
        <span className={styles.label}>Sign out</span>
      </Button>
    </nav>
  );
};

export default UserNav;
