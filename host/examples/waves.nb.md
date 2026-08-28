# Wave explorer

A `.nb.md` notebook. Switch to **App** mode to use it as a Streamlit-style app —
either way, every interaction reruns the whole document top-to-bottom on one
RunMat WASM kernel.

+++

Controls — drag the sliders in App mode, or run this cell and interact inline.

```matlab {jupyter.code-cell}
n    = sl_slider('points', 20, 600, 200, 10);
f    = sl_slider('frequency', 1, 8, 2, 0.5);
damp = sl_slider('damping', 0, 1, 0.3, 0.05);
kind = sl_selectbox('wave', {'sine', 'cosine', 'pulse'});
env  = sl_checkbox('show envelope', true);
```

+++

The signal and its plot:

```matlab {jupyter.code-cell}
x = linspace(0, 2*pi, n);
e = gather(exp(-damp * x));
if strcmp(kind, 'sine')
    y = gather(sin(f * x) .* e);
elseif strcmp(kind, 'cosine')
    y = gather(cos(f * x) .* e);
else
    y = gather(sign(sin(f * x)) .* e);
end

figure;
plot(x, y, 'LineWidth', 2);
if env
    hold on; plot(x, e, 'r--'); plot(x, -e, 'r--');
end
title(sprintf('%s, f = %.1f, damping = %.2f', kind, f, damp));
xlabel('x');
sl_figure();
```

+++

Summary metrics:

```matlab {jupyter.code-cell}
sl_metric('peak', max(y), '%.3f');
sl_metric('mean |y|', mean(abs(y)), '%.3f');
sl_text('%d points, wave energy %.2f', n, sum(y.^2));
```
