import java.net.*;
import javax.net.ssl.HttpsURLConnection;
public class DependencyProbe {
  public static void main(String[] args) throws Exception {
    long start = System.nanoTime();
    HttpsURLConnection c = (HttpsURLConnection)new URI(args[0]).toURL().openConnection(
      args.length > 1 ? new Proxy(Proxy.Type.HTTP, new InetSocketAddress("127.0.0.1", 7897)) : Proxy.NO_PROXY);
    c.setConnectTimeout(15000); c.setReadTimeout(15000); c.setRequestMethod("HEAD");
    try { System.out.println("status=" + c.getResponseCode() + " seconds=" + ((System.nanoTime()-start)/1e9)); }
    finally { c.disconnect(); }
  }
}
