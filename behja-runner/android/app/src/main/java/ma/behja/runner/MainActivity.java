package ma.behja.runner;

import android.os.Bundle;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // L'écran ne doit pas s'éteindre pendant une partie.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        pleinEcran();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) pleinEcran();
    }

    /** Mode immersif : barres système masquées, réaffichées par un glissement depuis le bord. */
    private void pleinEcran() {
        WindowInsetsControllerCompat controleur =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controleur.hide(WindowInsetsCompat.Type.systemBars());
        controleur.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }
}
