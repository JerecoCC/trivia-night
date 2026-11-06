import { useMemo, useState, type ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import BreadcrumbTitleRow from '@jerecocc/tracker-ui/components/Breadcrumbs/BreadcrumbTitleRow';
import BreadcrumbContext, { type BreadcrumbConfig } from '@/context/BreadcrumbContext';
import MobileTabsContext, { type MobileTabsState } from '@/context/MobileTabsContext';
import QueryProvider from '@/context/QueryProvider';
import TitleRowContext from '@/context/TitleRowContext';
import PageHeader from '@/shared/PageHeader/PageHeader';
import PageTitle from '@/shared/PageTitle/PageTitle';
import styles from './AppLayout.module.scss';

export interface AppNavigationProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

interface AppLayoutProps {
  renderNavigation: (props: AppNavigationProps) => ReactNode;
}

/** The app bar across the top, the navigation rail down the left, and the page beside it. */
const AppLayout = ({ renderNavigation }: AppLayoutProps) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  // State ref-callbacks trigger a render when portal targets become available.
  const [titleRowContainer, setTitleRowContainer] = useState<HTMLDivElement | null>(null);
  const [mobileTitleLeftContainer, setMobileTitleLeftContainer] = useState<HTMLDivElement | null>(
    null,
  );
  const [mobileTabs, setMobileTabs] = useState<MobileTabsState | null>(null);
  const [breadcrumbConfig, setBreadcrumbs] = useState<BreadcrumbConfig | null>(null);
  const mobileTabsContext = useMemo(() => ({ mobileTabs, setMobileTabs }), [mobileTabs]);
  const breadcrumbContext = useMemo(
    () => ({ config: breadcrumbConfig, setBreadcrumbs }),
    [breadcrumbConfig],
  );
  const titleRowContext = useMemo(
    () => ({ rowContainer: titleRowContainer, mobileLeftContainer: mobileTitleLeftContainer }),
    [titleRowContainer, mobileTitleLeftContainer],
  );
  const closeMobileNavigation = () => setMobileOpen(false);

  return (
    <QueryProvider>
      <BreadcrumbContext.Provider value={breadcrumbContext}>
        <MobileTabsContext.Provider value={mobileTabsContext}>
          <TitleRowContext.Provider value={titleRowContext}>
            <div className={styles.page}>
              {mobileOpen && (
                <div
                  className={styles.overlay}
                  onClick={closeMobileNavigation}
                  aria-hidden="true"
                />
              )}

              <PageHeader
                onMenuToggle={() => setMobileOpen((value) => !value)}
                mobileTitleLeftRef={setMobileTitleLeftContainer}
              />

              <div className={styles.body}>
                <div className={styles.sidebarWrapper}>
                  {renderNavigation({ mobileOpen, onMobileClose: closeMobileNavigation })}
                </div>

                <div
                  className={styles.scrollArea}
                  data-app-scroll-lock-target="true"
                >
                  <main className={styles.main}>
                    <PageTitle />
                    <div ref={setTitleRowContainer} />
                    <BreadcrumbTitleRow />
                    <Outlet />
                  </main>
                </div>
              </div>
            </div>
          </TitleRowContext.Provider>
        </MobileTabsContext.Provider>
      </BreadcrumbContext.Provider>
    </QueryProvider>
  );
};

export default AppLayout;
