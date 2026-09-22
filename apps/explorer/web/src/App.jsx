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
import { AppSettingsProvider, useAppSettings } from './components/AppSettingsProvider';

function ConfiguredApp() {
  const { settings, loading } = useAppSettings();

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
          <Route path="/docs" element={<Docs />} />
          <Route path="/token" element={<Token />} />
          <Route path="/developers" element={<Developers />} />
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
          <Route path="/bridge" element={<Bridge />} />
          <Route path="/network-tools" element={<NetworkTools />} />
          <Route
            path="/network-tools/social-e2e"
            element={optionalRoute(settings.networkConsoleEnabled, <SocialTest />)}
          />
          <Route path="/faucet" element={<Navigate to="/network-tools" replace />} />
          <Route
            path="/nft-demo"
            element={optionalRoute(settings.nftDemoEnabled, <NftDemo />)}
          />
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
