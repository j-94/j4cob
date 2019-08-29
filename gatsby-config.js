require("dotenv").config();

module.exports = {
  siteMetadata: {
    title: `Portfolio by Jacob`,
    name: `J4cob`,
    siteUrl: `www.j4cob.com`,
    description: `Jacob Sedgwick is a junior full-stack React developer and cyber security evangelist`,
    hero: {
      heading: `Welcome to J4cob.com portfolio.`,
      maxWidth: 652
    },
    social: [
      {
        name: `twitter`,
        url: `https://twitter.com/`
      },
      {
        name: `github`,
        url: `https://github.com/`
      },
      {
        name: `instagram`,
        url: `https://instagram.com/`
      },
      {
        name: `linkedin`,
        url: `https://www.linkedin.com/company/`
      },
      {
        name: `dribbble`,
        url: `https://dribbble.com/`
      }
    ]
  },
  plugins: [
    {
      resolve: "gatsby-source-contentful",
      options: {
        spaceId: process.env.CONTENTFUL_SPACE_ID,
        accessToken: process.env.CONTENTFUL_ACCESS_TOKEN
      }
    },
    {
      resolve: "@narative/gatsby-theme-novela",
      options: {
        contentPosts: "content/posts",
        contentAuthors: "content/authors",
        basePath: "/",
        authorsPage: true,
        sources: {
          local: true,
          contentful: true
        }
      }
    },
    {
      resolve: `gatsby-plugin-manifest`,
      options: {
        name: `Portfolio by Jacob`,
        short_name: `J4cob`,
        start_url: `/`,
        background_color: `#fff`,
        theme_color: `#fff`,
        display: `standalone`,
        icon: `src/assets/favicon.png`
      }
    }
  ]
};
