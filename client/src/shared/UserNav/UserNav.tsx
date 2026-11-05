import { useNavigate, useLocation } from 'react-router-dom';
import Button from '@jerecocc/tracker-ui/components/Button/Button';
import Icon from '@jerecocc/tracker-ui/components/Icon/Icon';
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

interface UserNavProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

const UserNav = (props: UserNavProps) => {
  const { collapsed, mobileOpen, onMobileClose } = props;
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const isActive = (path: string) => pathname === path || pathname.startsWith(path + '/');

  const showExpanded = !collapsed || !!mobileOpen;

  const handleNavClick = (path: string) => {
    navigate(path);
    onMobileClose?.();
  };

  return (
    <nav
      className={`${styles.nav} ${collapsed ? styles.collapsed : ''} ${mobileOpen ? styles.mobileOpen : ''}`}
    >
      <div className={styles.top}>
        {/* The app icon leads the name; collapsed, the icon stands alone. */}
        <div className={styles.brandRow}>
          <span className={styles.brand}>
            <img
              src="/favicon.svg"
              alt={showExpanded ? '' : 'Trivia Night'}
              className={styles.brandIcon}
            />
            {showExpanded && 'Trivia Night'}
          </span>
        </div>

        <ul className={styles.list}>
          {NAV_ITEMS.map(({ label, path, icon }) => (
            <li key={path}>
              <Button
                variant="ghost"
                intent="neutral"
                className={`${styles.navItem} ${isActive(path) ? styles.active : ''}`}
                onClick={() => handleNavClick(path)}
                tooltip={!showExpanded ? label : undefined}
                tooltipClassName={!showExpanded ? styles.navTooltipWrapper : undefined}
              >
                <Icon
                  name={icon}
                  className={styles.icon}
                />
                {showExpanded && <span className={styles.label}>{label}</span>}
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
};

export default UserNav;
