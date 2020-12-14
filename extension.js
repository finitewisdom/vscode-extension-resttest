const
    _ejs = require( "ejs" ),
    _http = require( "http" ),
    _https = require( "https" ),
    _path = require( "path" ),
    _vscode = require( "vscode" );

function getTest( line ) {

    var fn,
        myLine,
        test = {};
    
    myLine = String( line ).toLowerCase();
    if ( myLine.startsWith( "test" ) ) {

        test.string = myLine.substring( "test:".length ).trim();
        test.parts = test.string.split( " " );
        test.subject = ( test.parts.length > 0 ? test.parts[ 0 ] : null );
        test.op = ( test.parts.length > 1 ? test.parts[ 1 ] : null );
        test.value = ( test.parts.length > 2 ? test.parts.slice( 2 ).join( " " ) : null );

        if ( test.subject && test.op ) {
            fn = function( status, headers ) {

                var ret = { "line": test.string, "success": false };

                if ( test.subject === "status" && test.op === "equals" ) {
                    ret.success = ( String( status ) === test.value );
                } else if ( test.op === "exists" ) {
                    ret.success = ( test.subject in headers );
                } else if ( test.op === "contains" ) {
                    ret.success = ( headers[ test.subject ] && headers[ test.subject ].includes( test.value ) );
                }

                return ret;
            };
        }
    }

    return fn;
}

/**
 * @param {_vscode.ExtensionContext} context - Context for the extension itself
 */
function activate( context ) {
      
    const disposable = _vscode.commands.registerCommand( "resttest.test", function() {

        const editor = _vscode.window.activeTextEditor;
        if ( editor ) {

            const
                document = editor.document,
                selection = editor.selection,
                selectedText = document.getText( selection ).trim();

            if ( selectedText ) {

                let req,
                    blankFound = false,
                    requestLine,
                    test;

                const
                    headers = {},
                    headerLines = [],
                    tests = [],
                    template = _path.join( __dirname, "extension.ejs" );

                selectedText.split( "\n" ).forEach( ( line ) => {
                    if ( blankFound ) {
                        test = getTest( line );
                        if ( test ) {
                            tests.push( test );
                        }
                    } else if ( line.trim() === "" ) {
                        blankFound = true;
                    } else if ( !requestLine ) {
                        requestLine = line;
                    } else {
                        const pair = line.split( ":" );
                        if ( pair.length === 2 ) {
                            headers[ pair[ 0 ].trim() ] = pair[ 1 ].trim();
                        }
                        headerLines.push( line );
                    }
                } );

                req = {
                    "line": requestLine,
                    "headers": headers
                };

                doHttp( requestLine, headers, ( err, res ) => {
                    _ejs.renderFile( template, { err, req, res, tests }, null, ( err2, html ) => {
                        if ( err2 ) {
                            console.log( "err2", err2 );
                        } else {
                            const panel = _vscode.window.createWebviewPanel( "test", "REST Test", _vscode.ViewColumn.One, {} );
                            panel.webview.html = html;
                        }
                    } );
                } );
            }
        }
    } );

    context.subscriptions.push( disposable );	
}

function doHttp( requestLine, headers, callback ) {

    const methods = [ "OPTIONS", "GET", "HEAD", "POST", "PUT", "DELETE", "TRACE", "CONNECT" ];

    var body = "",
        cleanLine,
        method,
        options,
        out = {},
        thirds,
        url,
        protocol;

    //  collapse internal whitespace
    cleanLine = requestLine.replace( /[ \t]+/g, " " );

    //  split in thirds
    thirds = cleanLine.split( " " );
    if ( thirds.length !== 3 ) {
        return callback( new Error( `Request line is malformed (${ cleanLine })` ) );
    }

    //  validate third part
    if ( thirds[ 2 ] !== "HTTP/1.1" ) {
        return callback( new Error( `Request line is malformed (${ cleanLine }). Protocol must be "HTTP1.1"` ) );
    }

    //  validate first part
    method = thirds[ 0 ];
    if ( !methods.includes( method ) ) {
        return callback( new Error( `Invalid method (${ method }). Valid methods are ${ methods }` ) );
    }

    url = thirds[ 1 ];
    protocol = ( url.startsWith( "https:" ) ? _https : _http );
    options = { method, headers };

    {
        const req = protocol.request( url, options, ( res ) => {

            out.statusCode = res.statusCode;
            out.headers = res.headers;

            //  force headers to all lower-case
            const keys = Object.keys( res.headers );
            keys.forEach( ( key ) => {
                if ( key !== key.toLowerCase() ) {
                    res.headers[ key.toLowerCase() ] = res.headers[ key ];
                    delete res.headers[ key ];
                }
            } );

            res.on( "data", ( d ) => {
                body += d;
            } );

            res.on( "end", () => {
                out.body = body;
                return callback( null, out );
            } );
        } );

        req.on( "error", ( e ) => {
            return callback( e );
        } );

        req.end();  
    }  

    return undefined;
}

function deactivate() {
    //  nothing to do
}

module.exports = { activate, deactivate };
