import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { ToasterProvider } from './components/Toaster';
import Home from './pages/Home';
import Docs from './pages/Docs';
import Token from './pages/Token';
import Developers from './pages/Developers';
import Contact from './pages/Contact';
import Explorer from './pages/Explorer';
import TransactionDetails from './pages/TransactionDetails';
import BlockDetails from './pages/BlockDetails';
import ExplorerAccount from './pages/ExplorerAccount';
import ExplorerCreator from './pages/ExplorerCreator';
import ExplorerPost from './pages/ExplorerPost';
import ExplorerNft from './pages/ExplorerNft';
import ExplorerToken from './pages/ExplorerToken';
import ExplorerCollection from './pages/ExplorerCollection';
import Bridge from './pages/Bridge';
import NftDemo from './pages/NftDemo';
import NetworkTools from './pages/NetworkTools';
import SocialTest from './pages/SocialTestV2';
import ScrollToTop from './components/ScrollToTop';
import { AppSettingsProvider } from './components/AppSettingsProvider';
import { useAppSettings } from './components/AppSettingsContext';
import { useNetwork } from './components/NetworkContext';

function ConfiguredApp() {
  const { settings, loading } = useAppSettings();
  // Mainnet hides every test surface regardless of API visibility flags:
  // test console, NTF demo and the Social E2E lab never render on mainnet,
  // even when the backend enables them.
  const { testSurfacesVisible } = useNetwork();

  const optionalRoute = (enabled, element) => {
    if (loading) {
      return <div className="pt-32 text-center text-gray-400">Loading application settings…</div>;
    }
    return enabled ? element : <Navigate to="/explorer" replace />;
  };

  return (
      <Layout>
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/docs" element={optionalRoute(settings.docsEnabled, <Docs />)} />
          <Route path="/token" element={<Token />} />
          <Route path="/developers" element={optionalRoute(settings.developersEnabled, <Developers />)} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/explorer" element={<Explorer />} />
          <Route path="/explorer/tx/:hash" element={<TransactionDetails />} />
          <Route path="/explorer/block/:height" element={<BlockDetails />} />
          <Route path="/explorer/account/:address" element={<ExplorerAccount />} />
          <Route path="/explorer/creator/:address" element={<ExplorerCreator />} />
          <Route path="/explorer/post/:postId" element={<ExplorerPost />} />
          <Route path="/explorer/nft/:tokenId" element={<ExplorerNft />} />
          <Route path="/explorer/token/:mint" element={<ExplorerToken />} />
          <Route path="/explorer/collection/:collectionId" element={<ExplorerCollection />} />
          <Route path="/bridge" element={optionalRoute(settings.bridgeEnabled, <Bridge />)} />
          <Route
            path="/network-tools"
            element={optionalRoute(settings.networkToolsEnabled, <NetworkTools />)}
          />
          <Route
            path="/network-tools/social-e2e"
            element={optionalRoute(
              settings.networkToolsEnabled && settings.networkConsoleEnabled && testSurfacesVisible,
              <SocialTest />,
            )}
          />
          <Route path="/faucet" element={<Navigate to="/network-tools" replace />} />
          <Route
            path="/ntf"
            element={optionalRoute(settings.nftDemoEnabled && testSurfacesVisible, <NftDemo />)}
          />
          <Route path="/nft-demo" element={<Navigate to="/ntf" replace />} />
        </Routes>
      </Layout>
  );
}

function App() {
  return (
    <ToasterProvider>
      <AppSettingsProvider>
        <ConfiguredApp />
      </AppSettingsProvider>
    </ToasterProvider>
  );
}

export default App;
