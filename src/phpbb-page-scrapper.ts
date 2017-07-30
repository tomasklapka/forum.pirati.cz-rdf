
export enum PhpbbPageType {
    None,
    Root,
    Forum,
    Thread,
    Post,
    Group,
    User
}

export interface PhpbbPageScrapper {

    url: string;
    type: PhpbbPageType;
    phpbbid: number;
    title: string;

    // navigation info
    forumUrl: string;
    parentForumUrl: string;

    // pagination info
    page: number;
    firstPageUrl: string;

    // all links found
    links: any[];

    // list of thread posts
    posts: any[];

    // list of group users
    users: string[];

    // user data
    username: string;
    avatarSrc: string;
    rank: string;
    
    defaultGroup: string;
    groups: {};

    registered: string;
    lastVisit: string;
    totalPosts: number;

    signature: string;

    address: string;
    showOnMap: boolean;
    age: number;
    occupation: string;
    interests: string;
    profession: string;
    icq: number;
    www: string;
    jabber: string;

    likesGot: number;
    likesGave: number;

    scrap(): Promise<PhpbbPageScrapper>;
}
