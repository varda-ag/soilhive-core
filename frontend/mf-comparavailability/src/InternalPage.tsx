import Page from './Page';
import {store} from '../moduleFederation';
import { useState } from 'react';

function InternalPage() {
  //const countState = useState(0);
  return (
      // <store.CountProvider value={countState}>
        <Page />
      // </store.CountProvider>      
  );
};

export default InternalPage;