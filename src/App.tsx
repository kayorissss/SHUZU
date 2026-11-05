/** Корень приложения. */
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import { useApp } from './store';
import { useMediaQuery } from './hooks';
import TitleBar from './components/TitleBar';
import Splash from './components/Splash';
import { Rail, TabBar } from './components/Nav';
import { Toasts } from './components/ui';
import AddSubscription from './components/AddSubscription';
import { AboutModal, ConfirmModal, Onboarding, ServerDetailsModal, UpdateModal } from './components/Modals';
import Home from './screens/Home';
import Servers from './screens/Servers';
import Profile from './screens/Profile';
import SettingsScreen from './screens/Settings';
import Diagnostics from './screens/Diagnostics';
import Censor from './screens/Censor';
import Logs from './screens/Logs';

export default function App() {
  const init = useApp((s) => s.init);
  const booted = useApp((s) => s.booted);
  const splashVisible = useApp((s) => s.splashVisible);
  const screen = useApp((s) => s.screen);
  const settings = useApp((s) => s.settings);
  const openModal = useApp((s) => s.openModal);
  const info = useApp((s) => s.info);
  const wide = useMediaQuery('(min-width: 940px)');
  // на телефоне нет оконной рамки и бокового рельса — только нижние табы
  const isAndroid = info.platform === 'android';

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.dataset.accent = settings.accent;
    document.documentElement.lang = settings.language;
  }, [settings.theme, settings.accent, settings.language]);

  useEffect(() => {
    document.documentElement.dataset.platform = info.platform;
  }, [info.platform]);

  // первый запуск — показываем знакомство после заставки
  useEffect(() => {
    if (!booted || splashVisible) return;
    if (localStorage.getItem('shuzu.onboarded')) return;
    const id = setTimeout(() => openModal({ name: 'onboarding' }), 400);
    return () => clearTimeout(id);
  }, [booted, splashVisible, openModal]);

  const renderScreen = () => {
    switch (screen) {
      case 'servers':
        return <Servers />;
      case 'profile':
      case 'subscriptions':
        return <Profile />;
      case 'settings':
        return <SettingsScreen />;
      case 'diagnostics':
        return <Diagnostics />;
      case 'censor':
        return <Censor />;
      case 'logs':
        return <Logs />;
      case 'home':
      default:
        return <Home />;
    }
  };

  // ключ анимации: экраны одной «ветки» не пересоздаются
  const screenKey = screen === 'subscriptions' ? 'profile' : screen;

  return (
    <div className={`app${isAndroid ? ' app--android' : ''}`}>
      {!isAndroid && <TitleBar />}
      <div className="shell">
        {!isAndroid && <Rail />}
        <div className="main">
          <div className="screens">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={screenKey}
                className="screen"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="screen__inner" style={wide ? { height: screenKey === 'home' ? '100%' : undefined } : undefined}>
                  {renderScreen()}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
          <TabBar />
        </div>
      </div>

      <Toasts />
      <AddSubscription />
      <ServerDetailsModal />
      <UpdateModal />
      <ConfirmModal />
      <Onboarding />
      <AboutModal />

      <AnimatePresence>{splashVisible && <Splash />}</AnimatePresence>
    </div>
  );
}
