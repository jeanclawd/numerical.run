# Hello, numerical.run

The smallest useful notebook: an input, some state, a button. Try **App** mode.

```matlab {jupyter.code-cell}
name = nr_text_input('your name', 'world');
nr_text('Hello, %s!', name);

likes = nr_multiselect('favourite tools', {'runmat', 'streamlit', 'octave', 'python'}, {'runmat'});
nr_text('you picked %d tool(s)', numel(likes));
```

+++

Session state survives reruns even though the whole document reruns each time —
the value is baked back into the kernel between runs.

```matlab {jupyter.code-cell}
count = nr_state('clicks', 0);
if nr_button('count me')
    count = count + 1;
    nr_state_set('clicks', count);
end
nr_metric('button clicks', count, '%d');
```

+++

_One `.nb.md` file, two modes, one in-browser kernel._
