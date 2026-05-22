const CONFIG = {
      theme: window.matchMedia('(prefers-color-scheme: light)').matches
        ? 'glass-light'
        : 'glass-dark',

      clockOnClickAction: 'Help',
      clockDelimiter: ' – ',
      clockShowSeconds: false,
      clockShowAmPm: true,
      clockTwentyFourHour: true,
      clockTimeZone: undefined,

      weatherUnit: 'celsius', // 'celsius' or 'fahrenheit'

      helpKey: '?',

      queryInstantRedirect: false,
      queryNewTab: true,
      queryPathDelimiter: '/',
      querySearchDelimiter: "'",

      scripts: {
        q: ['bin', 'ddg', '*'],
      },

      suggestionInfluencers: [
        { name: 'Default', limit: 4 },
        { name: 'History', limit: 4, minChars: 2 },
        { name: 'DuckDuckGo', limit: 4, minChars: 2 },
      ],

      suggestionLimit: 4,

      suggestionDefaults: {
        0: ["0'8000", "0'8080"],
        c: ['c/calendar/u/1/r', 'c/calendar/u/2/r'],
        d: ['d/drive/u/1/my-drive', 'd/drive/u/2/my-drive'],
        g: ['g/trending', 'g/ossu', 'gist.github.com'],
        k: ['k/u/1', 'k/u/2'],
        m: ['m/mail/u/1', 'm/mail/u/2'],
        r: ['r/r/startpages', 'r/r/unixporn', 'r/r/onebag'],
        s: ['s/collection/tracks', 's/playlist/37i9dQZEVXcXr3r4FYT3J7'],
        u: ['u/explore', 'u/backgrounds'],
        y: ['y/feed/trending'],
      },

      commands: [
        { key: '*',   search: '/search?q={}', url: 'https://www.google.com' },
        { key: 'bin', search: '/search?q={}', url: 'https://www.bing.com' },
        { key: 'ddg', search: '/?q={}',       url: 'https://duckduckgo.com' },
        {
          hues: ['0', '0'], key: 'x', name: 'Netflix',
          search: '/search?q={}', url: 'https://www.netflix.com/browse',
        },
        {
          hues: ['0', '350'], key: 'c', name: 'Calendar',
          search: '/calendar/u/0/r/search?q={}',
          url: 'https://calendar.google.com/calendar/u/0/r',
        },
        {
          hues: ['5', '345'], key: 'y', name: 'YouTube',
          search: '/results?search_query={}',
          url: 'https://youtube.com/feed/subscriptions',
        },
        {
          hues: ['355', '5'], key: 'ym', name: 'YT Music',
          search: '/search?q={}',
          url: 'https://music.youtube.com',
        },
        {
          hues: ['266', '286'], key: 'f', name: 'Figma',
          url: 'https://www.figma.com/files/recent',
        },
        {
          hues: ['230', '280'], key: 'i', name: 'Instagram',
          url: 'https://www.instagram.com',
        },
        {
          hues: ['264', '244'], key: 'v', name: 'Twitch',
          url: 'https://www.twitch.tv/directory/following',
        },
        {
          hues: ['254', '234'], key: 'r', name: 'Reddit',
          search: '/search?q={}', url: 'https://www.reddit.com',
        },
        {
          hues: ['214', '234'], key: 'g', name: 'GitHub',
          search: '/search?q={}', url: 'https://github.com',
        },
        {
          hues: ['192', '232'], key: 'z', name: 'Telegram',
          url: 'https://web.telegram.org/z/',
        },
        {
          hues: ['201', '221'], key: 'l', name: 'LinkedIn',
          search: '/search/results/all/?keywords={}',
          url: 'https://www.linkedin.com',
        },
        {
          hues: ['217', '197'], key: 'm', name: 'Mail',
          search: '/mail/u/0/?q={}#search/{}',
          url: 'https://mail.google.com/mail/u/0',
        },
        {
          hues: ['203', '183'], key: 't', name: 'Twitter',
          search: '/search?q={}', url: 'https://twitter.com/home',
        },
        {
          hues: ['136', '156'], key: 'd', name: 'Drive',
          search: '/drive/u/0/search?q={}',
          url: 'https://drive.google.com/drive/u/0/my-drive',
        },
        {
          hues: ['124', '164'], key: 's', name: 'Spotify',
          search: '/search/{}', url: 'https://open.spotify.com',
        },
        {
          hues: ['45', '40'], key: 'k', name: 'Keep',
          search: '/u/0/#search/text={}',
          url: 'https://keep.google.com/u/0',
        },
        {
          hues: ['13', '33'], key: 'h', name: 'ProductHunt',
          search: '/search?q={}', url: 'https://www.producthunt.com',
        },
        {
          hues: ['4', '24'], key: 'n', name: 'Notion',
          url: 'https://www.notion.so',
        },
        {
          key: 'u', name: 'Unsplash',
          search: '/search/{}', url: 'https://unsplash.com/images',
        },
        {
          key: '0', name: 'Local',
          url: 'http://localhost:3000',
        },
      ].map((command) => {
        const hsla = (hue, sat = 'var(--command-color-saturation)') =>
          `hsla(${hue}, ${sat}, var(--command-color-lightness), 0.9)`;

        if (command.color || !command.name) return command;

        if (!Array.isArray(command.hues) || !command.hues.length) {
          command.color = hsla(0, '0%');
        } else if (command.hues.length === 1) {
          command.color = hsla(command.hues[0]);
        } else {
          const stops = command.hues.reduce((a, h) => `${a}, ${hsla(h)}`, '');
          command.color = `linear-gradient(135deg${stops})`;
        }

        return command;
      }),
    };
