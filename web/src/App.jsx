import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Docs from './pages/Docs';
import Token from './pages/Token';
import Developers from './pages/Developers';
import Contact from './pages/Contact';
import Explorer from './pages/Explorer';
import TransactionDetails from './pages/TransactionDetails';
import BlockDetails from './pages/BlockDetails';
import ScrollToTop from './components/ScrollToTop';

function App() {
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
      </Routes>
    </Layout>
  );
}

export default App;
