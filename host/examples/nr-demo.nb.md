```matlab {jupyter.code-cell}
nr_demo('Sine explorer', 'A tiny nr_demo() showcase — title, description, and tab title.');
```

+++

Drag the slider (App mode) — the header above comes from `nr_demo()`.

```matlab {jupyter.code-cell}
f = nr_slider('frequency', 1, 10, 3, 0.5);
x = linspace(0, 2*pi, 400);
figure; plot(x, sin(f * x)); nr_figure();
nr_metric('frequency', f, '%g');
```
