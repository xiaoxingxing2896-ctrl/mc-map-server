import { proxyToOrigin } from '../_proxy';

export const onRequest: PagesFunction = (context) => proxyToOrigin(context);
