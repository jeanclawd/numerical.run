# kNN playground

Controls live in the sidebar (App mode). The script reruns on every change.

```matlab {jupyter.code-cell}
nr_demo('kNN playground', 'k-nearest-neighbours on two interleaved classes');
nr_sidebar();
nr_header('controls');
k = nr_number_input('neighbours (k)', 5, 1, 15, 2);
jit = nr_slider('jitter', 0, 0.8, 0.3, 0.05);
metric = nr_radio('distance view', {'accuracy', 'errors'});
show_table = nr_checkbox('show test points', true);
nr_main();
```

+++

Build two interleaved classes, split train/test, and classify with kNN:

```matlab {jupyter.code-cell}
t = linspace(0, pi, 40);
ax = gather(cos(t) + jit * sin(7 * t));
ay = gather(sin(t) + jit * 0.8 * cos(11 * t));
bx = gather(1 - cos(t) + jit * sin(9 * t));
by = gather(0.35 - sin(t) + jit * 0.8 * cos(13 * t));
X = [ax bx; ay by]';
y = [zeros(40, 1); ones(40, 1)];
ti = 1:4:80; tr = 1:80; tr(ti) = [];
Xtr = X(tr, :); ytr = y(tr); ytr = ytr(:);
Xte = X(ti, :); yte = y(ti); yte = yte(:);

mu = mean(Xtr, 1); sg = std(Xtr, 0, 1);
D = pdist2((Xte - mu) ./ sg, (Xtr - mu) ./ sg);
yhat = zeros(numel(yte), 1);
for i = 1:numel(yte)
    [~, order] = sort(D(i, :));
    yhat(i) = mode(ytr(order(1:k)));
end
good = double(gather(yhat)) == yte;

prev = nr_state('prev accuracy', mean(good));
nr_state_set('prev accuracy', mean(good));

figure;
scatter(ax, ay, 26, 'filled'); hold on; scatter(bx, by, 26, 'filled');
title(sprintf('k = %d, jitter = %.2f', k, jit));
legend('class 0', 'class 1');
nr_figure();
```

+++

Report accuracy and, optionally, the test points:

```matlab {jupyter.code-cell}
nr_columns(2);
if strcmp(metric, 'accuracy')
    nr_metric('test accuracy', mean(good), '%.4f', mean(good) - prev);
else
    nr_metric('errors', sum(~good), '%d');
end
nr_nextcol();
nr_metric('train / test', numel(ytr), '%d + 20');
nr_endcols();

if show_table
    nr_header('test points');
    T = [Xte yte double(gather(yhat)) double(good)];
    nr_dataframe(T, {'x', 'y', 'true', 'predicted', 'correct'});
end
```
