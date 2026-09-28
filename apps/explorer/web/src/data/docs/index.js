import start_building from './start-building.json';
import cli_tools from './cli-tools.json';
import sdks from './sdks.json';
import programs_assets from './programs-assets.json';
import wallet_permissions from './wallet-permissions.json';
import socialfi from './socialfi.json';
import data_apis from './data-apis.json';
import security_recipes from './security-recipes.json';

const groups = [start_building, cli_tools, sdks, programs_assets, wallet_permissions, socialfi, data_apis, security_recipes];

const docsData = {
  sections: groups.map((group) => group.section),
  content: Object.assign({}, ...groups.map((group) => group.content)),
};

export default docsData;
