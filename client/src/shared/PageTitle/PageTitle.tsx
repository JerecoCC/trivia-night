import { useLocation } from 'react-router-dom';
import { useMobileTabs } from '@/context/MobileTabsContext';
import styles from './PageTitle.module.scss';

const EXACT_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/events': 'Events',
  '/quizzes': 'Quizzes',
};

const getTitle = (pathname: string): string =>
  EXACT_TITLES[pathname] ?? (pathname.startsWith('/quizzes/') ? 'Quiz' : '');

/** The current page's name, shown above its content. */
const PageTitle = () => {
  const { pathname } = useLocation();
  const { mobileTabs } = useMobileTabs();

  const title = getTitle(pathname);
  // On mobile, swap the route title for "{RoutePrefix} {ActiveTab}", e.g. "Night Info".
  const activeTabLabel = mobileTabs?.tabs[mobileTabs.activeIndex];
  const mobileTabTitle = activeTabLabel ? `${title.split(' ')[0]} ${activeTabLabel}` : null;

  if (!title) return null;
  return (
    <>
      <h1 className={`${styles.title} ${mobileTabTitle ? styles.titleHiddenMobile : ''}`}>
        {title}
      </h1>
      {mobileTabTitle && <h1 className={styles.titleMobileTab}>{mobileTabTitle}</h1>}
    </>
  );
};

export default PageTitle;
