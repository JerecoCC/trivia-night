import { useAuth } from '@/context/AuthContext';
import { useMobileTabs } from '@/context/MobileTabsContext';
import Icon from '@jerecocc/tracker-ui/components/Icon/Icon';
import styles from './PageHeader.module.scss';

const getInitials = (name: string | undefined) =>
  (name ?? '')
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

interface PageHeaderProps {
  onMenuToggle?: () => void;
  mobileTitleLeftRef?: (node: HTMLDivElement | null) => void;
}

/** The app bar across the top: the app name, who's signed in, and the mobile menu button. */
const PageHeader = ({ onMenuToggle, mobileTitleLeftRef }: PageHeaderProps) => {
  const { user } = useAuth();
  const { mobileTabs } = useMobileTabs();
  const userName = user?.display_name ?? user?.displayName;

  return (
    <header className={styles.header}>
      <div className={styles.titleRow}>
        <div className={styles.left}>
          <div
            ref={mobileTitleLeftRef}
            className={styles.mobileTitleLeft}
          />
          <span className={styles.brand}>
            <img
              src="/favicon.svg"
              alt=""
              className={styles.brandIcon}
            />
            Trivia Night
          </span>
        </div>

        <div className={styles.right}>
          {user && (
            <div className={styles.profile}>
              {user.photo ? (
                <img
                  src={user.photo}
                  alt=""
                  className={styles.avatar}
                />
              ) : (
                <span
                  className={styles.avatarInitials}
                  aria-hidden="true"
                >
                  {getInitials(userName)}
                </span>
              )}
              <span className={styles.displayName}>{userName}</span>
            </div>
          )}
          {onMenuToggle && (
            <button
              className={styles.hamburger}
              onClick={onMenuToggle}
              aria-label="Open navigation"
            >
              <Icon
                name="menu"
                size="1.4rem"
              />
            </button>
          )}
        </div>
      </div>

      {/* ── Mobile tab strip (below title row) ── */}
      {mobileTabs && (
        <div
          className={styles.mobileTabBar}
          role="tablist"
        >
          {mobileTabs.tabs.map((label, i) => {
            const iconName = mobileTabs.icons[i];
            return (
              <button
                key={label}
                role="tab"
                aria-label={label}
                aria-selected={mobileTabs.activeIndex === i}
                className={[
                  styles.mobileTab,
                  mobileTabs.activeIndex === i ? styles.mobileTabActive : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => mobileTabs.onChange(i)}
              >
                {iconName ? (
                  <Icon
                    name={iconName}
                    size="1.1rem"
                  />
                ) : (
                  label
                )}
              </button>
            );
          })}
        </div>
      )}
    </header>
  );
};

export default PageHeader;
