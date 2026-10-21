import { createContext, useContext } from 'react';
import publicConfig from '../../.generated/public-config.ts';
export { publicConfig };
export const ConfigContext = createContext(publicConfig);
export const usePublicConfig = () => useContext(ConfigContext);
